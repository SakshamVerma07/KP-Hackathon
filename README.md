# Commonroom

Real-time messaging for campus, with direct and group conversations. React + Vite frontend, Flask + Flask-SocketIO backend, PostgreSQL (SQLite allowed for local dev only).
The product name lives in `frontend/src/lib/brand.js` (plus `<title>` in `frontend/index.html`).

> **Verification status — read first.** This project was written in a sandbox with no network access and only Flask/Werkzeug installed.
> **Nothing below was executed end to end**: not the backend tests, not the Vitest suite, not the app itself, not a two-browser run.
> What _was_ run: Python byte-compilation of every backend file, `node --check` on the plain `.js` files, and a Node script exercising the pure
> logic (message dedupe/reconciliation, chat reducer ordering and unread counts, form validation) — all passed.
> Expect to fix small integration issues on first run; follow "Local development" and the acceptance checklist below.

## Implemented

- Register / login / logout / session restore; server-side revocable sessions (HttpOnly cookie + `auth_sessions` table); CSRF token on all authenticated writes; Origin allow-list; in-memory rate limits on login, register and messages.
- User search, private direct conversations (unique `direct_key` constraint → no duplicates under races), inbox with latest message / unread count / ordering.
- Socket.IO messaging: authenticated connect, per-event session re-validation, membership-checked rooms, persist-then-broadcast, acknowledgement with `client_id`, HTTP fallback, optimistic UI with sending/failed/retry, dedupe of ack vs broadcast.
- Animated typing indicators (not persisted), presence by connection count with last-seen, unread counts persisted via `last_read_message_id`, reconnect catch-up from the database, paginated history ("Load earlier messages").
- Group formation with a name and multiple selected members; group membership is enforced by the same conversation access checks.
- Message reactions (❤️ 😂 👍 🎉 😮 😢), stored per user/message/emoji and broadcast live over Socket.IO.
- Refreshed responsive UI with softer surfaces, improved spacing, animated typing feedback, expressive bubbles, and reaction chips; reduced-motion respected.
- `PATCH /api/users/me` exists (display name, bio) but **there is no profile screen**, to avoid a half-built control.

## Not implemented / limitations

- No message edit/delete, message search, avatars upload, or "seen" indicators in the UI (read state is stored and used for unread counts; the server emits a `read` event the UI doesn't display).
- **Single-process only.** Presence registry, rate limiter and Socket.IO rooms are in memory. Do not run multiple workers/instances. Scaling needs Redis (Socket.IO `message_queue`, shared limiter/presence) — not built.
- A message whose ack times out (8 s) is shown as "Not sent"; if the server actually saved it, it will also appear via broadcast, and Retry would create a second copy.
- Inbox query is N+1 per conversation (capped at 200); fine for hackathon scale, optimise before real load.
- Usernames are stored lowercase (case-insensitive by construction). No email verification or password reset.

## Structure

```
commonroom/
  backend/  app/{__init__,config,extensions,models,services,presence}.py  app/routes/{auth,users,conversations}.py
            app/sockets/__init__.py  app/utils/{security,ratelimit}.py  migrations/  tests/  run.py
  frontend/ src/{lib,features/{auth,conversations},components,pages,styles,test}
```

## Local development

Prereqs: Python 3.11+, Node 20+. PostgreSQL optional locally (SQLite file is used if `DATABASE_URL` is empty).

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then set SECRET_KEY (see below)
export $(grep -v '^#' .env | xargs)   # or use your shell/IDE to load .env
export FLASK_APP=run.py
flask db upgrade                # applies all migrations, including group descriptions and pictures (0003)
flask seed-dev                  # optional: alice/bob with random passwords printed once
python run.py                   # Socket.IO dev server on :5000 (do NOT use `flask run`)

# frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api and /socket.io to :5000
```

Generate a secret: `python -c "import secrets; print(secrets.token_hex(32))"`.
In dev, leave `VITE_API_URL` empty (same-origin via the Vite proxy, so `SameSite=Lax` cookies work).

**Migrations:** `flask db migrate -m "msg"` then review, then `flask db upgrade`. The initial migration is hand-written to match `models.py`; after your first run, `flask db migrate` should report no changes — if it reports differences, that's a bug in the hand-written file.

## Environment variables

| Var                       | Where                 | Purpose                                                                                  |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `SECRET_KEY`              | backend               | Signs session cookies. Required in production.                                           |
| `DATABASE_URL`            | backend               | Postgres URL from your provider. `postgres://` is rewritten to `postgresql+psycopg2://`. |
| `FRONTEND_ORIGINS`        | backend               | Exact allowed origins, comma separated (CORS, Socket.IO, Origin check). No wildcards.    |
| `APP_ENV`                 | backend               | `development` / `production`. Production forces Secure cookies.                          |
| `SESSION_COOKIE_SAMESITE` | backend               | `Lax` (same registrable domain) or `None` (cross-site; requires HTTPS).                  |
| `TRUST_PROXY`             | backend               | `1` behind Render/other proxy.                                                           |
| `VITE_API_URL`            | frontend (build time) | Public URL of the Flask service. Public by design — never put secrets in `VITE_*`.       |

## Tests

```bash
cd backend && pytest            # REST + Socket.IO tests (SQLite in-memory)
cd frontend && npm test         # Vitest + React Testing Library
```

Backend tests cover: registration/duplicates/hashing, login/logout, auth + CSRF protection, non-member access (404), sender spoofing ignored (REST and socket), persistence, validation/oversize, direct-conversation uniqueness, pagination + unread, socket delivery to both members and not to an outsider, non-member join denied, logout invalidating an open socket, typing scoping, reconnect catch-up, presence counting.
**Results: not run in the authoring environment (see top).**

## API (all JSON, errors as `{"error":{"code","message","fields?"}}`)

`POST /api/auth/{register,login,logout}` · `GET /api/auth/me` · `GET /api/users/search?q=` · `GET /api/users/:id` · `PATCH /api/users/me` ·
`GET /api/conversations` · `POST /api/conversations/direct {user_id}` · `POST /api/conversations/group {name,user_ids}` · `POST /api/conversations/:id/messages/:message_id/reactions {emoji}` · `GET /api/conversations/:id` · `GET|POST /api/conversations/:id/messages?before=&limit=` · `POST /api/conversations/:id/read` · `GET /healthz`, `/readyz`.
Authenticated writes need header `X-CSRF-Token` (value returned by login/register/`me`; the React app keeps it in memory only).
Socket events: client→server `message:send`, `typing`, `join`, `read`; server→client `message:new`, `message:reactions`, `typing`, `presence`, `read`.

## Deployment (free tiers — verify current limits yourself)

I could not reach any provider documentation from the authoring sandbox, so the steps below are from general knowledge and **unverified against today's docs**. Check each provider's current free-tier limits, WebSocket support, and sleep behaviour before relying on them. Free instances can sleep (first request/connection is slow) and quotas can change; don't promise uptime.

1. **Database (Supabase or any Postgres):** create a project, copy the connection string into `DATABASE_URL`. If the backend host is IPv4-only, use the provider's pooled/IPv4 connection string rather than a direct one.
2. **Backend (Render web service, root `backend/`):**
   build `pip install -r requirements.txt`; pre-deploy/one-off `flask db upgrade` (with `FLASK_APP=run.py`);
   start `gunicorn --worker-class gthread --workers 1 --threads 50 --bind 0.0.0.0:$PORT run:app`.
   Env: `APP_ENV=production`, `SECRET_KEY`, `DATABASE_URL`, `FRONTEND_ORIGINS=https://<your-frontend>`, `TRUST_PROXY=1`, `SESSION_COOKIE_SAMESITE`. **Keep one worker.**
3. **Frontend (Vercel, root `frontend/`):** build `npm run build`, output `dist`, env `VITE_API_URL=https://<your-backend>`. `vercel.json` provides the SPA rewrite.
4. **Cookies across domains — real risk.** If the frontend (`*.vercel.app`) and backend (`*.onrender.com`) are different sites, you need `SameSite=None; Secure`, and browsers that block third-party cookies (Safari by default, Chrome in some modes) will break login. The robust fix is a custom domain with both under one registrable domain (e.g. `app.example.com` + `api.example.com`) and `SESSION_COOKIE_SAMESITE=Lax`. Do not try to proxy Socket.IO WebSockets through Vercel rewrites.
5. Don't use SQLite or local files in production.

## Manual acceptance checklist

1. Two different browsers/profiles → register `alice` and `bob`. 2. Alice: + → search "bob" → open. 3. Alice sends; appears in Bob's inbox and chat with no refresh (unread badge if Bob is elsewhere). 4. Bob replies; Alice sees it. 5. Refresh both → history and unread state persist. 6. Register `carol`; she sees neither the chat nor can open `/c/<id>` (shows "isn't available"). 7. Alice logs out → `/` redirects to login, her socket is dropped; sending from a stale tab fails. 8. Stop the backend for 20 s → "Reconnecting…" banner; restart → messages sent meanwhile appear. 9. Narrow window < 720px → list and chat become separate screens.


## Profile, group details, and themes update

- Toggle dark/light appearance using the moon/sun control in the left rail. Preference is stored in browser local storage.
- Click your avatar in the rail to edit your display name, bio, and profile picture URL. Profile pictures must be publicly accessible HTTP(S) image URLs.
- In a direct conversation, click the other person's avatar to view their public profile. In a group conversation, use “View group members” or click the group avatar to view group details and members; select a member to view their profile.
- Backend profile updates accept `avatar_url` on `PATCH /api/users/me`.
#   K P - H a c k a t h o n  
 