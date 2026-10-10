import { Link, Outlet, useMatch } from "react-router-dom";
import { useEffect, useState } from "react";
import { Moon, Sun, UserRound, X, Save, Users, Palette, Check } from "lucide-react";
import { api } from "../lib/api";
import { LogOut, MessageSquare, WifiOff } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useChat } from "../features/conversations/ChatProvider.jsx";
import { BRAND } from "../lib/brand.js";
import Avatar from "./Avatar.jsx";
import ConversationList from "./ConversationList.jsx";

export default function Shell() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem("commonroom-theme") === "dark");
  const palettes = [
    { id: "green", name: "Forest", color: "linear-gradient(135deg,#28785f,#83c99f)" },
    { id: "sunset", name: "Red sunset", color: "linear-gradient(135deg,#ef4444,#f97316)" },
    { id: "ocean", name: "Ocean", color: "linear-gradient(135deg,#0369a1,#22d3ee)" },
    { id: "berry", name: "Berry", color: "linear-gradient(135deg,#7e22ce,#ec4899)" },
    { id: "fire", name: "Fire", color: "linear-gradient(135deg,#b91c1c,#f59e0b)" },
    { id: "aurora", name: "Aurora", color: "linear-gradient(135deg,#0f766e,#8b5cf6)" },
    { id: "lavender", name: "Lavender", color: "linear-gradient(135deg,#6366f1,#c084fc)" },
    { id: "peach", name: "Peach", color: "linear-gradient(135deg,#fb7185,#fdba74)" },
    { id: "mint", name: "Mint", color: "linear-gradient(135deg,#059669,#a3e635)" },
    { id: "ice", name: "Ice blue", color: "linear-gradient(135deg,#2563eb,#a5f3fc)" },
    { id: "candy", name: "Candy", color: "linear-gradient(135deg,#db2777,#818cf8)" },
    { id: "gold", name: "Golden hour", color: "linear-gradient(135deg,#b45309,#facc15)" },
    { id: "night", name: "Night sky", color: "linear-gradient(135deg,#312e81,#0891b2)" },
    { id: "coral", name: "Coral", color: "linear-gradient(135deg,#e11d48,#fb7185)" },
    { id: "lagoon", name: "Lagoon", color: "linear-gradient(135deg,#0f766e,#3b82f6)" }
  ];
  const [accent, setAccent] = useState(() => localStorage.getItem("commonroom-accent") || "green");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState({ display_name: user.display_name || "", bio: user.bio || "", avatar_url: user.avatar_url || "" });
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("commonroom-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { document.documentElement.dataset.accent = accent; localStorage.setItem("commonroom-accent", accent); }, [accent]);
  function palettePicker() { return <div className="palette-wrap"><button className="icon-btn palette-trigger" onClick={() => setPaletteOpen(v => !v)} aria-label="Choose color theme" title="Color theme"><Palette size={18}/><span className="palette-trigger-label">Theme</span></button>{paletteOpen && <div className="palette-popover" role="dialog" aria-label="Choose color theme"><div className="palette-heading">Gradient theme</div><div className="palette-grid">{palettes.map(p => <button key={p.id} className={`palette-option ${accent === p.id ? "selected" : ""}`} onClick={() => { setAccent(p.id); setPaletteOpen(false); }} title={p.name} aria-label={p.name} aria-pressed={accent === p.id}><span className="palette-swatch" style={{ background: p.color }}>{accent === p.id && <Check size={15}/>}</span><span>{p.name}</span></button>)}</div></div>}</div>; }
  useEffect(() => { setDraft({ display_name: user.display_name || "", bio: user.bio || "", avatar_url: user.avatar_url || "" }); }, [user]);
  async function saveProfile(e) { e.preventDefault(); setSaving(true); setProfileError(""); try { const result = await api.patch("/users/me", draft); window.location.reload(); } catch (err) { setProfileError(err.message || "Couldn't save profile."); setSaving(false); } }
  const { state } = useChat();
  const inChat = !!useMatch("/c/:id");
  const offline = state.connection === "reconnecting" || state.connection === "offline";

  return (
    <div className="app" data-view={inChat ? "chat" : "list"}>
      <nav className="rail" aria-label="Main">
        <span className="rail-mark" aria-hidden="true">{BRAND.name[0]}</span>
        <Link className="rail-link is-active" to="/" aria-label="Inbox" aria-current="page"><MessageSquare size={20} /></Link>
        <div className="rail-spacer" />
        {palettePicker()}
        <button className="icon-btn" onClick={() => setDark(v => !v)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="icon-btn" onClick={() => setProfileOpen(true)} aria-label="Edit profile" title="Edit profile"><Avatar name={user.display_name} src={user.avatar_url} size={32} /></button>
        <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
      </nav>
      <aside className="list" aria-label="Conversations"><ConversationList /></aside>
      <main className="chat"><Outlet /></main>
      <div className="mobile-account-bar" aria-label="Account controls">
        {palettePicker()}
        <button className="icon-btn" onClick={() => setDark(v => !v)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun size={19} /> : <Moon size={19} />}<span>{dark ? "Light" : "Dark"}</span></button>
        <button className="icon-btn" onClick={() => setProfileOpen(true)} aria-label="Edit profile"><Avatar name={user.display_name} src={user.avatar_url} size={28}/><span>Profile</span></button>
        <button className="icon-btn" onClick={logout} aria-label="Log out"><LogOut size={18}/><span>Log out</span></button>
      </div>
      {profileOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setProfileOpen(false); }}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><header className="profile-modal-head"><h2 id="profile-title">Your profile</h2><button className="icon-btn" onClick={() => setProfileOpen(false)} aria-label="Close"><X size={18}/></button></header><form className="profile-form" onSubmit={saveProfile}><div className="profile-preview"><Avatar name={draft.display_name} src={draft.avatar_url} size={72}/><div><strong>{draft.display_name || "Your name"}</strong><p className="muted">@{user.username}</p></div></div><label className="field"><span>Display name</span><input maxLength={50} required value={draft.display_name} onChange={e => setDraft(d => ({...d, display_name:e.target.value}))}/></label><label className="field"><span>About you</span><textarea rows={3} maxLength={280} value={draft.bio} onChange={e => setDraft(d => ({...d, bio:e.target.value}))} placeholder="A little about yourself…"/></label><label className="field"><span>Profile picture URL</span><input type="url" placeholder="https://example.com/photo.jpg" value={draft.avatar_url} onChange={e => setDraft(d => ({...d, avatar_url:e.target.value}))}/><small className="muted">Use a publicly accessible image URL.</small></label>{profileError && <p className="form-error">{profileError}</p>}<button className="btn btn-primary btn-block" disabled={saving}><Save size={16}/>{saving ? "Saving…" : "Save profile"}</button></form></section></div>}
      {offline && (
        <div className="banner" role="status">
          <WifiOff size={16} aria-hidden="true" /> Reconnecting… messages will sync when you're back.
        </div>
      )}
    </div>
  );
}
