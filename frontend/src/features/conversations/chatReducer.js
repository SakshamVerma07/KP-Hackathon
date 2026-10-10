import { markFailed, removePending, upsertMessage } from "../../lib/messages";

export const initialState = { loaded: false, error: null, conversations: [], messages: {}, typing: {}, connection: "connecting" };

const blank = { items: [], hasMore: false, status: "idle", loadingOlder: false, error: null };
const getM = (s, cid) => s.messages[cid] || blank;
const setM = (s, cid, patch) => ({ ...s, messages: { ...s.messages, [cid]: { ...getM(s, cid), ...patch } } });
const stamp = (c) => c.last_message?.created_at || c.updated_at;
const sortConvs = (l) => [...l].sort((a, b) => stamp(b).localeCompare(stamp(a)));

export function chatReducer(s, a) {
  switch (a.type) {
    case "convs": return { ...s, loaded: true, error: null, conversations: sortConvs(a.conversations) };
    case "convsError": return { ...s, loaded: true, error: a.message };
    case "convUpsert": {
      const rest = s.conversations.filter((c) => c.id !== a.conversation.id);
      return { ...s, conversations: sortConvs([...rest, a.conversation]) };
    }
    case "msgsLoading": return setM(s, a.cid, { status: "loading", error: null });
    case "msgsLoaded": {
      const m = getM(s, a.cid);
      const maxId = a.items.length ? a.items[a.items.length - 1].id : 0;
      const keep = m.items.filter((x) => x.pending || x.id > maxId); // keep live arrivals that raced the fetch
      return setM(s, a.cid, { items: [...a.items, ...keep], hasMore: a.hasMore, status: "ready", error: null });
    }
    case "msgsError": return setM(s, a.cid, { status: "error", error: a.message, loadingOlder: false });
    case "olderLoading": return setM(s, a.cid, { loadingOlder: true });
    case "msgsOlder": {
      const m = getM(s, a.cid);
      const have = new Set(m.items.map((x) => x.id));
      return setM(s, a.cid, { items: [...a.items.filter((x) => !have.has(x.id)), ...m.items], hasMore: a.hasMore, loadingOlder: false });
    }
    case "msgUpsert": return setM(s, a.cid, { items: upsertMessage(getM(s, a.cid).items, a.msg) });
    case "reactions": return setM(s, a.cid, { items: getM(s, a.cid).items.map((m) => m.id === a.messageId ? { ...m, reactions: a.reactions } : m) });
    case "msgFailed": return setM(s, a.cid, { items: markFailed(getM(s, a.cid).items, a.clientId) });
    case "msgRemove": return setM(s, a.cid, { items: removePending(getM(s, a.cid).items, a.clientId) });
    case "applyMessage": {
      const c = s.conversations.find((x) => x.id === a.cid);
      if (!c || (c.last_message && c.last_message.id >= a.msg.id)) return s; // already applied (ack + broadcast)
      const bump = a.msg.sender_id !== a.me && !a.active;
      const next = { ...c, last_message: a.msg, unread_count: c.unread_count + (bump ? 1 : 0) };
      return { ...s, conversations: sortConvs([...s.conversations.filter((x) => x.id !== a.cid), next]) };
    }
    case "unreadZero":
      return { ...s, conversations: s.conversations.map((c) => (c.id === a.cid ? { ...c, unread_count: 0 } : c)) };
    case "typing": {
      const cur = { ...(s.typing[a.cid] || {}) };
      if (a.typing) cur[a.uid] = true; else delete cur[a.uid];
      return { ...s, typing: { ...s.typing, [a.cid]: cur } };
    }
    case "presence":
      return { ...s, conversations: s.conversations.map((c) => c.participant?.id === a.userId
        ? { ...c, participant: { ...c.participant, online: a.online, last_seen_at: a.lastSeen ?? c.participant.last_seen_at } } : c) };
    case "invalidate": {
      const messages = {};
      for (const [cid, m] of Object.entries(s.messages)) messages[cid] = { ...m, status: "idle" };
      return { ...s, messages };
    }
    case "connection": return { ...s, connection: a.value };
    default: return s;
  }
}
