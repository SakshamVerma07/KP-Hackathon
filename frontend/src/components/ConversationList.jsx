import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Plus, Search } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useChat } from "../features/conversations/ChatProvider.jsx";
import { api } from "../lib/api.js";
import { formatListTime } from "../lib/format.js";
import { BRAND } from "../lib/brand.js";
import Avatar from "./Avatar.jsx";

function NewConversation({ onClose }) {
  const { openDirect, createGroup } = useChat();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState([]);
  const [res, setRes] = useState({ status: "idle", users: [], error: "" });

  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes({ status: "idle", users: [], error: "" }); return; }
    let stale = false;
    setRes((r) => ({ ...r, status: "loading" }));
    const t = setTimeout(() => {
      api.get(`/users/search?q=${encodeURIComponent(term)}`)
        .then((d) => !stale && setRes({ status: "ready", users: d.users, error: "" }))
        .catch((e) => !stale && setRes({ status: "error", users: [], error: e.message }));
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  async function makeGroup() {
    try { const c = await createGroup(groupName.trim(), selected); onClose(); navigate(`/c/${c.id}`); }
    catch (e) { setRes((r) => ({ ...r, status: "error", error: e.message })); }
  }

  async function pick(u) {
    if (groupMode) { setSelected((ids) => ids.includes(u.id) ? ids.filter((id) => id !== u.id) : [...ids, u.id]); return; }
    try {
      const c = await openDirect(u.id);
      onClose();
      navigate(`/c/${c.id}`);
    } catch (e) { setRes((r) => ({ ...r, status: "error", error: e.message })); }
  }

  return (
    <>
      <div className="list-head">
        <button className="icon-btn" onClick={onClose} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
        <h2>{groupMode ? "Create a group" : "New conversation"}</h2>
      </div>
      {!groupMode && <button className="group-toggle" onClick={() => setGroupMode(true)}>＋ Create a group</button>}
      {groupMode && <div className="group-create"><label htmlFor="group-name">Group name</label><input id="group-name" value={groupName} maxLength={80} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Design club"/><p>{selected.length} member{selected.length === 1 ? "" : "s"} selected</p><button className="btn btn-primary" disabled={!groupName.trim() || !selected.length} onClick={makeGroup}>Create group</button></div>}
      <div className="search">
        <Search size={16} aria-hidden="true" />
        <input autoFocus aria-label="Search people" placeholder="Search by name or username" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list-body">
        {res.status === "idle" && <p className="list-note">Type a name or username to find someone.</p>}
        {res.status === "loading" && <p className="list-note" role="status">Searching…</p>}
        {res.status === "error" && <p className="list-note error" role="alert">{res.error}</p>}
        {res.status === "ready" && res.users.length === 0 && <p className="list-note">No one found for “{q.trim()}”.</p>}
        {res.status === "ready" && (
          <ul>
            {res.users.map((u) => (
              <li key={u.id}>
                <button className={`row ${selected.includes(u.id) ? "selected" : ""}`} onClick={() => pick(u)}>
                  <Avatar name={u.display_name} online={u.online} />
                  <span className="row-main">
                    <span className="row-title">{u.display_name}</span>
                    <span className="row-sub">@{u.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function ConversationList() {
  const { logout } = useAuth();
  const { state, loadConversations } = useChat();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  if (creating) return <NewConversation onClose={() => setCreating(false)} />;

  const f = filter.trim().toLowerCase();
  const rows = state.conversations.filter((c) =>
    !f || c.name?.toLowerCase().includes(f) || c.participant?.display_name.toLowerCase().includes(f) || c.participant?.username.includes(f) || c.last_message?.body.toLowerCase().includes(f));

  return (
    <>
      <div className="list-head">
        <h2><span className="wordmark">{BRAND.name}</span></h2>
        <div className="list-actions">
          <button className="icon-btn" onClick={() => setCreating(true)} aria-label="New conversation" title="New conversation"><Plus size={18} /></button>
          <button className="icon-btn only-mobile" onClick={logout} aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </div>
      <div className="search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Filter conversations" placeholder="Search conversations" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="list-body">
        {!state.loaded && <div role="status" aria-label="Loading conversations">{[0, 1, 2, 3].map((i) => <div key={i} className="row skeleton" />)}</div>}
        {state.loaded && state.error && (
          <div className="list-note error" role="alert">
            <p>{state.error}</p>
            <button className="btn" onClick={loadConversations}>Retry</button>
          </div>
        )}
        {state.loaded && !state.error && state.conversations.length === 0 && (
          <div className="list-note">
            <p><strong>No conversations yet</strong></p>
            <p>Find someone on campus to start your first one.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>Start a conversation</button>
          </div>
        )}
        {state.loaded && !state.error && state.conversations.length > 0 && rows.length === 0 && <p className="list-note">No matches for “{filter.trim()}”.</p>}
        <ul>
          {rows.map((c) => (
            <li key={c.id}>
              <NavLink to={`/c/${c.id}`} className={({ isActive }) => `row${isActive ? " active" : ""}`}>
                <Avatar name={c.name || c.participant?.display_name || "Group"} src={c.avatar_url || c.participant?.avatar_url} online={c.type !== "group" && Boolean(c.participant?.online)} />
                <span className="row-main">
                  <span className="row-title">{c.name || c.participant?.display_name || "Group chat"}</span>
                  <span className={`row-sub ${c.unread_count ? "strong" : ""}`}>{c.last_message?.body || "No messages yet"}</span>
                </span>
                <span className="row-meta">
                  <time dateTime={c.last_message?.created_at}>{formatListTime(c.last_message?.created_at)}</time>
                  {c.unread_count > 0 && <span className="badge" aria-label={`${c.unread_count} unread`}>{c.unread_count > 99 ? "99+" : c.unread_count}</span>}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
