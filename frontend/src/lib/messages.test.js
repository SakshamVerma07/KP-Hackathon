import { describe, expect, it } from "vitest";
import { markFailed, upsertMessage } from "./messages";

const server = (id, extra = {}) => ({ id, conversation_id: 1, sender_id: 1, body: `m${id}`, created_at: "2026-01-01T00:00:00Z", ...extra });
const pending = { id: null, client_id: "c1", pending: true, status: "sending", body: "hi", sender_id: 1 };

describe("upsertMessage", () => {
  it("does not duplicate a message delivered twice", () => {
    let l = upsertMessage([], server(1));
    l = upsertMessage(l, server(1));
    expect(l).toHaveLength(1);
  });
  it("replaces the optimistic copy when the broadcast arrives before the ack", () => {
    let l = upsertMessage([], pending);
    l = upsertMessage(l, server(5, { body: "hi" }));            // broadcast (no client_id)
    l = upsertMessage(l, server(5, { body: "hi", client_id: "c1" })); // ack
    expect(l).toHaveLength(1);
    expect(l[0].id).toBe(5);
    expect(l[0].pending).toBeUndefined();
  });
  it("replaces the optimistic copy when the ack arrives first", () => {
    let l = upsertMessage([], pending);
    l = upsertMessage(l, server(5, { client_id: "c1" }));
    l = upsertMessage(l, server(5));
    expect(l.map((m) => m.id)).toEqual([5]);
  });
  it("keeps server order and puts pending last; failed marks only its own", () => {
    let l = upsertMessage([], pending);
    l = upsertMessage(l, server(3));
    l = upsertMessage(l, server(2));
    expect(l.map((m) => m.id)).toEqual([2, 3, null]);
    expect(markFailed(l, "c1")[2].status).toBe("failed");
  });
});
