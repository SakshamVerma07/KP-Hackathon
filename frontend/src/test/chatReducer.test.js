import { describe, expect, it } from "vitest";
import { chatReducer, initialState } from "../features/conversations/chatReducer";

const conv = (id, ts, unread = 0) => ({ id, updated_at: ts, unread_count: unread, last_message: null, participant: { id: id * 10, online: false } });
const msg = (id, cid, sender, ts) => ({ id, conversation_id: cid, sender_id: sender, body: "x", created_at: ts });

describe("chatReducer", () => {
  const base = chatReducer(initialState, { type: "convs", conversations: [conv(1, "2026-01-01T00:00:00Z"), conv(2, "2026-01-02T00:00:00Z")] });

  it("orders conversations by latest activity and routes messages to the right one", () => {
    expect(base.conversations.map((c) => c.id)).toEqual([2, 1]);
    const s = chatReducer(base, { type: "applyMessage", cid: 1, msg: msg(9, 1, 10, "2026-01-03T00:00:00Z"), me: 99, active: false });
    expect(s.conversations.map((c) => c.id)).toEqual([1, 2]);
    expect(s.conversations[0].unread_count).toBe(1);
    expect(s.conversations[1].unread_count).toBe(0);
  });
  it("counts an unread message once even if ack and broadcast both arrive", () => {
    const m = msg(9, 1, 10, "2026-01-03T00:00:00Z");
    let s = chatReducer(base, { type: "applyMessage", cid: 1, msg: m, me: 99, active: false });
    s = chatReducer(s, { type: "applyMessage", cid: 1, msg: m, me: 99, active: false });
    expect(s.conversations[0].unread_count).toBe(1);
  });
  it("does not add unread for the active conversation or own messages", () => {
    const s = chatReducer(base, { type: "applyMessage", cid: 1, msg: msg(9, 1, 10, "2026-01-03T00:00:00Z"), me: 99, active: true });
    expect(s.conversations[0].unread_count).toBe(0);
  });
  it("stores messages per conversation without duplicates", () => {
    let s = chatReducer(base, { type: "msgUpsert", cid: 1, msg: msg(1, 1, 10, "t") });
    s = chatReducer(s, { type: "msgUpsert", cid: 1, msg: msg(1, 1, 10, "t") });
    s = chatReducer(s, { type: "msgUpsert", cid: 2, msg: msg(2, 2, 10, "t") });
    expect(s.messages[1].items).toHaveLength(1);
    expect(s.messages[2].items).toHaveLength(1);
  });
});
