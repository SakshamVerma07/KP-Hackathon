import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "../../lib/api";
import { newClientId } from "../../lib/messages";
import { connectSocket, disconnectSocket, getSocket } from "../../lib/socket";
import { useAuth } from "../auth/AuthProvider";
import { chatReducer, initialState } from "./chatReducer";

const ChatContext = createContext(null);
export const useChat = () => useContext(ChatContext);
const PAGE = 40;

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const me = user.id;
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const active = useRef(null);
  const typingTimers = useRef({});

  const loadConversations = useCallback(async () => {
    try { dispatch({ type: "convs", conversations: (await api.get("/conversations")).conversations }); }
    catch (e) { dispatch({ type: "convsError", message: e.message }); }
  }, []);

  const loadLatest = useCallback(async (cid) => {
    dispatch({ type: "msgsLoading", cid });
    try {
      const d = await api.get(`/conversations/${cid}/messages?limit=${PAGE}`);
      dispatch({ type: "msgsLoaded", cid, items: d.messages, hasMore: d.has_more });
    } catch (e) { dispatch({ type: "msgsError", cid, message: e.message }); }
  }, []);

  const loadOlder = useCallback(async (cid) => {
    const first = stateRef.current.messages[cid]?.items.find((m) => !m.pending);
    if (!first) return;
    dispatch({ type: "olderLoading", cid });
    try {
      const d = await api.get(`/conversations/${cid}/messages?limit=${PAGE}&before=${first.id}`);
      dispatch({ type: "msgsOlder", cid, items: d.messages, hasMore: d.has_more });
    } catch (e) { dispatch({ type: "msgsError", cid, message: e.message }); }
  }, []);

  const markRead = useCallback((cid) => {
    dispatch({ type: "unreadZero", cid });
    api.post(`/conversations/${cid}/read`).catch(() => {});
  }, []);

  const setActive = useCallback((cid) => { active.current = cid; }, []);

  useEffect(() => {
    loadConversations();
    const s = connectSocket();
    const conn = (value) => dispatch({ type: "connection", value });

    s.on("connect", () => {
      conn("connected");
      // (Re)connected: anything sent while we were away lives in the database, so refetch it.
      dispatch({ type: "invalidate" });
      loadConversations();
      if (active.current) loadLatest(active.current);
    });
    s.on("disconnect", (reason) => conn(reason === "io client disconnect" ? "offline" : "reconnecting"));
    s.on("connect_error", () => {
      conn("reconnecting");
      api.get("/auth/me").catch(() => {}); // a 401 here triggers the global sign-out
    });
    s.io.on("reconnect_attempt", () => conn("reconnecting"));

    s.on("message:new", ({ conversation_id: cid, message }) => {
      const isActive = active.current === cid && !document.hidden;
      dispatch({ type: "msgUpsert", cid, msg: message });
      if (!stateRef.current.conversations.some((c) => c.id === cid)) loadConversations();
      dispatch({ type: "applyMessage", cid, msg: message, me, active: isActive });
      if (isActive && message.sender_id !== me) markRead(cid);
    });

    s.on("typing", ({ conversation_id: cid, user_id: uid, typing }) => {
      dispatch({ type: "typing", cid, uid, typing });
      const key = `${cid}:${uid}`;
      clearTimeout(typingTimers.current[key]);
      if (typing) typingTimers.current[key] = setTimeout(() => dispatch({ type: "typing", cid, uid, typing: false }), 5000);
    });

    s.on("message:reactions", ({ conversation_id: cid, message_id, reactions }) => dispatch({ type: "reactions", cid, messageId: message_id, reactions }));

    s.on("presence", ({ user_id, online, last_seen_at }) =>
      dispatch({ type: "presence", userId: user_id, online, lastSeen: last_seen_at }));

    const onVisible = () => { if (!document.hidden && active.current) markRead(active.current); };
    document.addEventListener("visibilitychange", onVisible);
    const timers = typingTimers.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      Object.values(timers).forEach(clearTimeout);
      disconnectSocket();
    };
  }, [me, loadConversations, loadLatest, markRead]);

  const send = useCallback((cid, body) => {
    const clientId = newClientId();
    dispatch({ type: "msgUpsert", cid, msg: { id: null, client_id: clientId, pending: true, status: "sending", body, sender_id: me, conversation_id: cid, created_at: new Date().toISOString() } });
    const confirm = (message) => {
      dispatch({ type: "msgUpsert", cid, msg: { ...message, client_id: clientId } });
      dispatch({ type: "applyMessage", cid, msg: message, me, active: true });
    };
    const fail = () => dispatch({ type: "msgFailed", cid, clientId });
    const s = getSocket();
    if (s?.connected) {
      s.timeout(8000).emit("message:send", { conversation_id: cid, body, client_id: clientId }, (err, res) => {
        if (err || !res?.ok) fail(); else confirm(res.message);
      });
    } else {
      api.post(`/conversations/${cid}/messages`, { body }).then((r) => confirm(r.message)).catch(fail);
    }
  }, [me]);

  const retry = useCallback((cid, m) => {
    dispatch({ type: "msgRemove", cid, clientId: m.client_id });
    send(cid, m.body);
  }, [send]);

  const sendTyping = useCallback((cid, typing) => {
    const s = getSocket();
    if (s?.connected) s.emit("typing", { conversation_id: cid, typing });
  }, []);

  const openDirect = useCallback(async (userId) => {
    const { conversation } = await api.post("/conversations/direct", { user_id: userId });
    dispatch({ type: "convUpsert", conversation });
    return conversation;
  }, []);

  const createGroup = useCallback(async (name, userIds) => {
    const { conversation } = await api.post("/conversations/group", { name, user_ids: userIds });
    dispatch({ type: "convUpsert", conversation });
    return conversation;
  }, []);

  const toggleReaction = useCallback(async (cid, mid, emoji) => {
    const { reactions } = await api.post(`/conversations/${cid}/messages/${mid}/reactions`, { emoji });
    dispatch({ type: "reactions", cid, messageId: mid, reactions });
  }, []);

  const fetchConversation = useCallback(async (cid) => {
    const { conversation } = await api.get(`/conversations/${cid}`);
    dispatch({ type: "convUpsert", conversation });
  }, []);

  const value = useMemo(() => ({
    state, loadConversations, loadLatest, loadOlder, markRead, setActive, send, retry, sendTyping, openDirect, createGroup, toggleReaction, fetchConversation,
  }), [state, loadConversations, loadLatest, loadOlder, markRead, setActive, send, retry, sendTyping, openDirect, createGroup, toggleReaction, fetchConversation]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
