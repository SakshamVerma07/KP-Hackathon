# Commonroom

**A modern web chat application for staying connected.**

Commonroom is a web-based chat app designed to make conversations feel
personal, expressive, and easy to manage. Chat with people, participate
in groups, share media and links, react to messages, and customise the
experience to suit your style.

> **Project status:** Update this section with your current release
> stage (for example, In Development, Beta, or Stable).

## ✨ Features

- **Authenticated accounts** --- Register and log in to access your
  account.
- **Profiles and profile pictures** --- Personalise your identity.
- **Group chats** --- Bring multiple people into one conversation.
- **Image sharing** --- Share images directly in chats.
- **Link sharing** --- Send links to websites and other online
  resources.
- **Message reactions** --- React to messages to express yourself
  quickly.
- **Message forwarding** --- Forward messages to another conversation
  when supported by the app.
- **Customisable themes** --- Adjust the app's appearance to your
  preference.
- **Real-time messaging** --- Designed around a responsive chat
  experience using Socket.IO.

## 🧰 Tech Stack

The project uses the following technologies:

Technology Purpose

---

React Frontend user interface
Flask Backend API and application logic
Socket.IO Real-time communication
Python Backend runtime
JavaScript Frontend application logic

## 🚀 Getting Started

### Prerequisites

Install the tools required by your project:

- Python 3
- Node.js and npm
- Git (recommended)

### 1. Get the project

Clone the repository, or download and extract the project files.

```bash
git clone <your-repository-url>
cd Commonroom
```

Replace `<your-repository-url>` with your repository URL. If you already
have the project locally, open a terminal in its root directory instead.

### 2. Set up the backend

Move into the backend directory (adjust the path to match your project):

```bash
cd backend
```

Create and activate a Python virtual environment.

**Windows (PowerShell):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

```bash
$env:FRONTEND_ORIGINS="http://localhost:5173,http://your-local-ip-address-found-using-ipconfig:5173"
```

```bash
flask db upgrade
```

```bash
python run.py
```

### 3. Set up the frontend

Open a **second terminal** and move into the frontend directory:

```bash
cd frontend
npm install
npm audit fix --force
npm run dev
```

### 4. Open Commonroom

Open the local frontend URL printed by the development server in your
browser.

## ⚙️ Configuration

Keep machine-specific settings and secrets out of committed source code.
Depending on your implementation, configuration may include:

- Backend host and port
- Frontend API base URL
- Socket.IO server URL
- Database connection settings
- Authentication/session secret
- Allowed frontend origins
- Upload/storage settings

Use environment variables or a local `.env` file if your application
supports them. Add secret files to `.gitignore`, and provide a
`.env.example` containing placeholder values rather than real
credentials.

Example placeholder configuration (rename variables to match your code):

```env
# Example only — use the variable names expected by your app.
SECRET_KEY=replace-with-a-long-random-secret
FRONTEND_ORIGIN=http://localhost:5173
```

Never commit passwords, API keys, production secrets, or real user data.

## 🖥️ Local Network Access

If you want to use Commonroom from another device on the same Wi-Fi/LAN,
ensure that:

1.  The frontend is served on an address accessible to the network.
2.  The backend binds to an appropriate network interface for your
    intended setup.
3.  The frontend API and Socket.IO URLs point to the host computer's LAN
    IP or a reachable hostname---not `localhost` on the other device.
4.  Flask CORS and Socket.IO origin settings allow the frontend's actual
    origin.
5.  The operating system firewall allows the required ports.

Only expose the development server to trusted networks. For public use,
deploy behind a production-ready server and use HTTPS.

## 🧪 Troubleshooting

### Frontend loads, but login or API calls fail

- Check that the Flask backend is running.
- Check the API base URL configured in the frontend.
- Inspect the browser's Developer Tools **Network** and **Console**
  tabs.
- Verify that the backend allows the frontend origin through CORS.
- Review backend logs for the exact response and traceback.

### `Origin not allowed` or CORS errors

- Compare the browser's frontend origin (scheme, hostname, and port)
  with the backend's allowed-origin configuration.
- Allow only the required development origins.
- Check both Flask-CORS and Socket.IO CORS settings if both are used.
- Restart the backend after configuration changes.

### `401 Unauthorized`

- Confirm that login succeeds and the frontend sends the expected
  session cookie or authentication token.
- Check cookie, credential, and token handling in the frontend and
  backend.
- Verify that protected routes use the same authentication approach as
  the login flow.

### `403 Forbidden`

- Check backend authorisation rules, CSRF protections if enabled, and
  any origin checks.
- Review the server response body and logs to identify which check
  rejected the request.

### Real-time messages do not arrive

- Confirm the Socket.IO server URL and port.
- Check the browser Network tab for the Socket.IO connection and
  handshake.
- Verify that the connection is authenticated if required and that
  event names match on both sides.

## 🛣️ Possible Future Improvements

Depending on the goals of the project, future additions could include:

- Read receipts
- Searchable chat history
- Message editing and deletion
- Notifications
- Accessibility improvements and responsive mobile layouts
- Automated tests and CI checks
- Production deployment documentation

## 🤝 Contributing

Contributions and suggestions are welcome.

1.  Create a branch for your change.
2.  Keep changes focused and describe their purpose.
3.  Test the affected frontend and backend flows.
4.  Open a pull request with a clear summary and testing notes.

Adjust this section to match your project's actual contribution process.

## 📄 License

No license has been specified here. Add a `LICENSE` file and update this
section before distributing the project. Without an explicit license,
others may not have permission to reuse or redistribute the code.

---

Made with ❤️ for better conversations.

**Commonroom --- your space to connect.**
