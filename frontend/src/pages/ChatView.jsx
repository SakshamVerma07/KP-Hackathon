import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Send, Smile, Users, UserRound, X, ImagePlus, Copy, Forward, Reply, Pin, Maximize2, UserPlus, UserMinus, Search, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import Avatar from "../components/Avatar.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useChat } from "../features/conversations/ChatProvider.jsx";
import { formatDay, formatLastSeen, formatTime, sameDayIso } from "../lib/format.js";

function Composer({ cid, disabled, replyTo, clearReply }) {
  const { send, sendTyping } = useChat();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const typing = useRef(false);
  const timer = useRef(null);
  const ref = useRef(null);

  const stop = () => { clearTimeout(timer.current); if (typing.current) { typing.current = false; sendTyping(cid, false); } };
  useEffect(() => { setText(""); return stop; }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  function onChange(e) {
    setText(e.target.value);
    if (!typing.current) { typing.current = true; sendTyping(cid, true); }
    clearTimeout(timer.current);
    timer.current = setTimeout(stop, 2000);
  }
  async function attachImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { window.alert("Please choose an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { window.alert("Choose an image smaller than 10 MB."); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => { const scale = Math.min(1, 1280 / img.width, 1280 / img.height); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.78)); }; img.onerror = reject; img.src = dataUrl; });
      send(cid, image);
    } catch { window.alert("Could not read that image. Try another file."); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  function submit() {
    const body = text.trim();
    if (!body || disabled) return;
    stop();
    send(cid, replyTo ? `↪ Reply to: “${String(replyTo.body || "").slice(0, 180)}”\n${body}` : body);
    setText("");
    if (replyTo) clearReply();
    ref.current?.focus();
  }
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {replyTo && <div className="reply-context"><span>Replying to: {String(replyTo.body || "Image").slice(0, 100)}</span><button type="button" className="icon-btn" onClick={clearReply} aria-label="Cancel reply"><X size={15}/></button></div>}
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose an image" onChange={e => attachImage(e.target.files?.[0])} />
      <button type="button" className="icon-btn image-attach" aria-label="Attach image" title="Attach image" disabled={uploading || disabled} onClick={() => fileRef.current?.click()}><ImagePlus size={19}/></button>
      <label htmlFor="composer" className="sr-only">Message</label>
      <textarea
        id="composer" ref={ref} rows={1} value={text} maxLength={2000} placeholder="Write a message" onChange={onChange}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
      />
      <button className="btn btn-primary send" disabled={(!text.trim() && !uploading) || disabled} aria-label="Send message">{uploading ? "…" : <Send size={18} />}</button>
    </form>
  );
}

function MessageText({ text }) {
  const urlPattern = /(https?:\/\/[^\s<]+)/gi;
  return String(text || "").split(urlPattern).map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      const url = part.match(/^[.,!?;:]+$/) ? null : part.replace(/[),.!?;:]+$/, "");
      if (url) { const tail = part.slice(url.length); return <span key={i}><a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{url}<ExternalLink size={11} /></a>{tail}</span>; }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cid = Number(id);
  const { user } = useAuth();
  const { state, loadLatest, loadOlder, markRead, setActive, retry, fetchConversation, toggleReaction, send } = useChat();
  const conv = state.conversations.find((c) => c.id === cid);
  const m = state.messages[cid] || { items: [], status: "idle", hasMore: false };
  const [missing, setMissing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ name: "", description: "", avatar_url: "" });
  const [groupSaving, setGroupSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [forwardTarget, setForwardTarget] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [pinned, setPinned] = useState(() => { try { return JSON.parse(localStorage.getItem(`pinned:${id}`) || "[]"); } catch { return []; } });
  const [groupError, setGroupError] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [memberBusy, setMemberBusy] = useState(false);
  const listRef = useRef(null);
  const stick = useRef(true);
  const prevHeight = useRef(null);

  useEffect(() => { setMissing(false); try { setPinned(JSON.parse(localStorage.getItem(`pinned:${cid}`) || "[]")); } catch { setPinned([]); } }, [cid]);
  useEffect(() => {
    if (!state.loaded || conv || missing) return;
    fetchConversation(cid).catch(() => setMissing(true));
  }, [state.loaded, conv, cid, missing, fetchConversation]);

  useEffect(() => {
    if (!conv) return undefined;
    setActive(cid);
    return () => setActive(null);
  }, [cid, !!conv, setActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (conv && m.status === "idle") loadLatest(cid); }, [cid, !!conv, m.status, loadLatest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (conv?.unread_count > 0 && !document.hidden) markRead(cid); }, [cid, conv?.unread_count, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { stick.current = true; }, [cid]);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current != null) { el.scrollTop = el.scrollHeight - prevHeight.current; prevHeight.current = null; }
    else if (stick.current || m.items[m.items.length - 1]?.sender_id === user.id) el.scrollTop = el.scrollHeight;
  }, [m.items.length, cid, m.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return (
      <div className="chat-empty" role="alert">
        <AlertCircle size={24} aria-hidden="true" />
        <p className="serif">This conversation isn't available</p>
        <p className="muted">It may not exist, or you're not a member.</p>
        <Link className="btn" to="/">Back to inbox</Link>
      </div>
    );
  }
  if (!conv) return <div className="chat-empty" role="status">Loading conversation…</div>;

  const group = conv.type === "group";
  useEffect(() => { if (conv) setGroupDraft({ name: conv.name || "", description: conv.description || "", avatar_url: conv.avatar_url || "" }); }, [conv?.id, conv?.name, conv?.description, conv?.avatar_url]);
  const p = conv.participant || { display_name: conv.name || "Group chat", online: false, last_seen_at: null };
  const typers = Object.keys(state.typing[cid] || {}).filter((uid) => Number(uid) !== user.id);
  const typingNow = typers.length > 0;
  const status = typingNow ? `${group ? `${typers.length} member${typers.length > 1 ? "s" : ""}` : p.display_name} typing…` : group ? `${conv.participants?.length || 0} members` : p.online ? "Online" : formatLastSeen(p.last_seen_at);
  const items = m.items;
  async function saveGroup(e) { e.preventDefault(); setGroupSaving(true); setGroupError(""); try { await api.patch(`/conversations/${cid}/group`, groupDraft); await fetchConversation(cid); setDetailsOpen(false); } catch (e) { setGroupError(e.message || "Could not save group details."); } finally { setGroupSaving(false); } }
  async function searchMembers(value) {
    setMemberQuery(value);
    if (value.trim().length < 1) { setMemberResults([]); return; }
    try { const data = await api.get(`/users/search?q=${encodeURIComponent(value.trim())}`); setMemberResults((data.users || []).filter(u => !(conv.participants || []).some(m => m.id === u.id))); } catch { setMemberResults([]); }
  }
  async function addMember(uid) { setMemberBusy(true); setGroupError(""); try { await api.post(`/conversations/${cid}/members`, { user_ids: [uid] }); await fetchConversation(cid); setMemberQuery(""); setMemberResults([]); } catch (e) { setGroupError(e.message || "Could not add member."); } finally { setMemberBusy(false); } }
  async function removeMember(uid) { if (!window.confirm("Remove this person from the group?")) return; setMemberBusy(true); setGroupError(""); try { await api.delete(`/conversations/${cid}/members/${uid}`); await fetchConversation(cid); } catch (e) { setGroupError(e.message || "Could not remove member."); } finally { setMemberBusy(false); } }
  async function leaveGroup() {
    if (!window.confirm("Leave this group? You will no longer receive its messages.")) return;
    try { await api.post(`/conversations/${cid}/leave`, {}); localStorage.removeItem(`pinned:${cid}`); navigate("/"); window.location.reload(); }
    catch (e) { setGroupError(e.message || "Could not leave group."); }
  }
  async function deleteGroup() {
    if (!window.confirm("Delete this group for everyone? This permanently removes its messages and members.")) return;
    try { await api.delete(`/conversations/${cid}/group`); localStorage.removeItem(`pinned:${cid}`); navigate("/"); window.location.reload(); }
    catch (e) { setGroupError(e.message || "Could not delete group."); }
  }
  async function showProfile(uid) { setProfileLoading(true); setProfile(null); try { setProfile((await api.get(`/users/${uid}`)).user); } catch { setProfile({ error: "Profile unavailable" }); } finally { setProfileLoading(false); } }

  function pinMessage(msg) { const next = pinned.includes(msg.id) ? pinned.filter(x => x !== msg.id) : [...pinned, msg.id]; setPinned(next); localStorage.setItem(`pinned:${cid}`, JSON.stringify(next)); }
  async function copyMessage(msg) {
    const value = msg.body || "";
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(value);
      else { const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const ok = document.execCommand("copy"); area.remove(); if (!ok) throw new Error("Copy failed"); }
      setCopyNotice("Message copied");
    } catch { setCopyNotice("Unable to copy this message"); }
    window.setTimeout(() => setCopyNotice(""), 1800);
  }
  function replyMessage(msg) { setReplyTo(msg); document.querySelector("#composer")?.focus(); }
  function forwardMessage(msg) {
    const clean = { ...msg, body: String(msg.body || "").replace(/^(?:↪\s*(?:Reply to|Forwarded message):\s*)+/i, "").replace(/^“|”$/g, "") };
    setForwarding(clean); setForwardTarget("");
  }
  function confirmForward() {
    if (!forwarding || !forwardTarget) return;
    const body = forwarding.body || "";
    send(Number(forwardTarget), body.startsWith("data:image/") ? body : `↪ Forwarded message: ${body}`);
    setForwarding(null); setForwardTarget("");
  }

  function jumpToPinned() {
    const targetId = pinned.find(pid => items.some(item => item.id === pid));
    if (!targetId) { window.alert("The pinned message is not loaded yet. Load earlier messages and try again."); return; }
    const target = document.getElementById(`message-${targetId}`);
    if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("message-highlight"); window.setTimeout(() => target.classList.remove("message-highlight"), 1600); }
  }

  function onScroll() {
    const el = listRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  async function older() {
    prevHeight.current = listRef.current.scrollHeight;
    await loadOlder(cid);
  }

  return (
    <>
      <header className="chat-head">
        <Link to="/" className="icon-btn only-mobile" aria-label="Back to conversations"><ArrowLeft size={20} /></Link>
        <button className="profile-trigger" onClick={() => group ? setDetailsOpen(true) : showProfile(p.id)} aria-label={group ? "View group details and members" : "View profile"}><button className="avatar-zoom" onClick={() => group ? setLightbox(conv.avatar_url || null) : showProfile(p.id)} aria-label="View full picture"><Avatar name={group ? conv.name : p.display_name} src={group ? conv.avatar_url : p.avatar_url} online={!group && p.online} /></button></button>
        <div>
          <h2>{group ? conv.name : p.display_name}</h2>
          <p className={`status ${typingNow || p.online ? "on" : ""}`} aria-live="polite">{status}</p>
        </div>
      </header>
      {group && <button className="group-details-link" onClick={() => setDetailsOpen(true)}><Users size={15}/> View group members</button>}
      {(detailsOpen || profile || profileLoading) && <div className="modal-backdrop" onMouseDown={e => { if(e.target===e.currentTarget){setDetailsOpen(false);setProfile(null);}}}><section className="profile-modal" role="dialog" aria-modal="true"><header className="profile-modal-head"><h2>{detailsOpen ? `${conv.name} · Group details` : "Profile"}</h2><button className="icon-btn" onClick={() => {setDetailsOpen(false);setProfile(null);}} aria-label="Close"><X size={18}/></button></header>{detailsOpen ? <div className="members-panel"><p className="muted">{conv.participants?.length || 0} members · Created {conv.created_at ? new Date(conv.created_at).toLocaleDateString() : ""}</p><div className="group-profile-preview"><button className="avatar-zoom" onClick={() => setLightbox(groupDraft.avatar_url || null)} aria-label="View full group picture"><Avatar name={groupDraft.name} src={groupDraft.avatar_url} size={64}/></button><p>{conv.description || "No group description yet."}</p></div><form className="profile-form group-edit-form" onSubmit={saveGroup}><label className="field"><span>Group name</span><input value={groupDraft.name} maxLength={80} required onChange={e=>setGroupDraft(d=>({...d,name:e.target.value}))}/></label><label className="field"><span>Description</span><textarea rows={2} maxLength={500} value={groupDraft.description} placeholder="What is this group for?" onChange={e=>setGroupDraft(d=>({...d,description:e.target.value}))}/></label><label className="field"><span>Group picture URL</span><input type="url" value={groupDraft.avatar_url} placeholder="https://example.com/group.jpg" onChange={e=>setGroupDraft(d=>({...d,avatar_url:e.target.value}))}/></label>{groupError && <p className="form-error">{groupError}</p>}<button className="btn btn-primary btn-block" disabled={groupSaving}><Users size={15}/>{groupSaving ? "Saving…" : "Save group details"}</button></form><div className="group-member-tools"><label className="field"><span>Add members</span><input value={memberQuery} onChange={e=>searchMembers(e.target.value)} placeholder="Search by name or username" /></label>{memberResults.map(candidate => <button className="member-row" key={candidate.id} onClick={()=>addMember(candidate.id)} disabled={memberBusy}><Avatar name={candidate.display_name} src={candidate.avatar_url}/><span><strong>{candidate.display_name}</strong><small className="muted">@{candidate.username}</small></span><UserPlus size={16}/></button>)}</div><div className="group-danger-actions"><button className="btn" onClick={leaveGroup}>Leave group</button><button className="btn btn-danger" onClick={deleteGroup}>Delete group for everyone</button></div>{(conv.participants || []).map(member => <div className="member-row" key={member.id}><button className="member-main" onClick={() => {setDetailsOpen(false);showProfile(member.id);}}><Avatar name={member.display_name} src={member.avatar_url} online={member.online}/><span><strong>{member.display_name}{member.id === user.id ? " (you)" : ""}</strong><small className="muted">@{member.username}</small></span><UserRound size={16}/></button>{member.id !== user.id && <button className="icon-btn member-remove" title="Remove member" disabled={memberBusy} onClick={()=>removeMember(member.id)}><UserMinus size={15}/></button>}</div>)}{/* old member list replaced */}{false && (conv.participants || []).map(member => <button className="member-row" key={member.id} onClick={() => {setDetailsOpen(false);showProfile(member.id);}}><Avatar name={member.display_name} src={member.avatar_url} online={member.online}/><span><strong>{member.display_name}{member.id === user.id ? " (you)" : ""}</strong><small className="muted">@{member.username}</small></span><UserRound size={16}/></button>)}</div> : profileLoading ? <p className="list-note">Loading profile…</p> : profile?.error ? <p className="list-note">{profile.error}</p> : profile && <div className="public-profile"><button className="avatar-zoom" onClick={() => setLightbox(profile.avatar_url || null)} aria-label="View full profile picture"><Avatar name={profile.display_name} src={profile.avatar_url} size={84} online={profile.online}/></button><h3>{profile.display_name}</h3><p className="muted">@{profile.username}</p><p>{profile.bio || "No bio yet."}</p><p className="muted">{profile.online ? "Online now" : profile.last_seen_at ? `Last seen ${new Date(profile.last_seen_at).toLocaleString()}` : ""}</p></div>}</section></div>}
      {pinned.length > 0 && <button type="button" className="pinned-banner" onClick={jumpToPinned} title="Jump to pinned message"><Pin size={15}/><span><strong>Pinned in this chat · Click to jump</strong>{items.find(x => pinned.includes(x.id))?.body?.startsWith("data:image/") ? "Image message" : (items.find(x => pinned.includes(x.id))?.body || "Pinned message")}</span></button>}
      {copyNotice && <div className="copy-toast" role="status">{copyNotice}</div>}
      <div className="messages" ref={listRef} onScroll={onScroll} role="log" aria-label={`Messages with ${p.display_name}`}>
        {m.status === "loading" && items.length === 0 && <p className="list-note" role="status">Loading messages…</p>}
        {m.status === "error" && (
          <div className="list-note error" role="alert">
            <p>{m.error}</p>
            <button className="btn" onClick={() => loadLatest(cid)}>Retry</button>
          </div>
        )}
        {m.status === "ready" && items.length === 0 && <p className="list-note">No messages yet. Say hello to {p.display_name}.</p>}
        {typingNow && <div className="typing-indicator" aria-live="polite"><span className="typing-dots"><i/><i/><i/></span>{group ? "Someone is typing" : `${p.display_name} is typing`}</div>}
        {m.hasMore && <button className="btn load-older" onClick={older} disabled={m.loadingOlder}>{m.loadingOlder ? "Loading…" : "Load earlier messages"}</button>}
        {items.map((msg, i) => {
          const mine = Number(msg.sender_id) === Number(user.id);
          const sender = (conv.participants || []).find(member => Number(member.id) === Number(msg.sender_id));
          const senderName = mine ? (user.display_name || user.username || "You") : (sender?.display_name || sender?.username || "Group member");
          const newDay = i === 0 || !sameDayIso(items[i - 1].created_at, msg.created_at);
          return (
            <div id={msg.id ? `message-${msg.id}` : undefined} key={msg.id ?? msg.client_id}>
              {newDay && <div className="day"><span>{formatDay(msg.created_at)}</span></div>}
              <div className={`msg ${mine ? "mine" : "theirs"} ${msg.status === "failed" ? "failed" : ""}`}>
                {group && <div className={`msg-sender-name ${mine ? "mine-name" : ""}`}>{senderName}</div>}
                {pinned.includes(msg.id) && <div className="pinned-label"><Pin size={12}/> Pinned message</div>}
                {typeof msg.body === "string" && msg.body.startsWith("data:image/") ? <div className="bubble image-bubble"><button className="shared-image-button" onClick={() => setLightbox(msg.body)} aria-label="View image full screen"><img src={msg.body} alt="Shared image" loading="lazy"/><Maximize2 size={15}/></button></div> : <p className="bubble"><MessageText text={msg.body} /></p>}
                {msg.id && <div className="reaction-row">{["❤️", "😂", "👍", "🎉", "😮", "😢"].map((emoji) => {
                  const reactions = msg.reactions || [];
                  const count = reactions.filter((r) => r.emoji === emoji).length;
                  const mineReacted = reactions.some((r) => r.emoji === emoji && r.user_id === user.id);
                  return <button key={emoji} className={`reaction ${mineReacted ? "reacted" : ""}`} title={`React with ${emoji}`} aria-label={`React with ${emoji}${count ? `, ${count} reactions` : ""}`} onClick={() => toggleReaction(cid, msg.id, emoji).catch(() => {})}>{emoji}{count > 0 && <span>{count}</span>}</button>;
                })}</div>}
                {msg.id && <div className="message-actions" aria-label="Message actions">
                  <button title="Reply" aria-label="Reply" onClick={() => replyMessage(msg)}><Reply size={14}/></button>
                  <button title="Forward" aria-label="Forward" onClick={() => forwardMessage(msg)}><Forward size={14}/></button>
                  <button title="Copy" aria-label="Copy message" onClick={() => copyMessage(msg)}><Copy size={14}/></button>
                  <button title={pinned.includes(msg.id) ? "Unpin message" : "Pin message"} aria-label="Pin message" onClick={() => pinMessage(msg)}><Pin size={14}/></button>
                </div>}
                <p className="msg-meta">
                  {msg.status === "failed" ? (
                    <>Not sent · <button className="link" onClick={() => retry(cid, msg)}>Retry</button></>
                  ) : msg.status === "sending" ? "Sending…" : <time dateTime={msg.created_at}>{formatTime(msg.created_at)}</time>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <Composer cid={cid} disabled={false} replyTo={replyTo} clearReply={() => setReplyTo(null)} />
      {forwarding && <div className="modal-backdrop" onMouseDown={e => { if(e.target===e.currentTarget) setForwarding(null); }}><section className="profile-modal forward-modal" role="dialog" aria-modal="true" aria-labelledby="forward-title"><header className="profile-modal-head"><h2 id="forward-title">Forward message</h2><button className="icon-btn" onClick={() => setForwarding(null)} aria-label="Close"><X size={18}/></button></header><p className="muted">Choose a conversation to forward this message to.</p><label className="field"><span>Conversation</span><select value={forwardTarget} onChange={e => setForwardTarget(e.target.value)}><option value="">Select a chat…</option>{state.conversations.filter(c => c.id !== cid).map(c => <option key={c.id} value={c.id}>{c.name || c.participant?.display_name || "Group chat"}</option>)}</select></label><div className="forward-preview">{forwarding.body?.startsWith("data:image/") ? "Image message" : forwarding.body}</div><button className="btn btn-primary btn-block" disabled={!forwardTarget} onClick={confirmForward}><Forward size={16}/> Forward</button></section></div>}
      {lightbox && <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}><button className="icon-btn lightbox-close" onClick={() => setLightbox(null)} aria-label="Close image"><X size={24}/></button><img src={lightbox} alt="Full size preview" onClick={e => e.stopPropagation()}/></div>}
    </>
  );
}
