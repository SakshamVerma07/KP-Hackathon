// Pure helpers for message lists. Server messages have a numeric `id`;
// optimistic ones have `pending: true`, `id: null` and a `client_id`.

const order = (list) => [
  ...list.filter((m) => !m.pending).sort((a, b) => a.id - b.id),
  ...list.filter((m) => m.pending),
];

export function upsertMessage(list, msg) {
  // A confirmed message replaces its optimistic twin, whichever of ack/broadcast arrives first.
  const rest = list.filter((m) => !(msg.client_id && m.pending && m.client_id === msg.client_id));
  const i = msg.id != null ? rest.findIndex((m) => m.id === msg.id) : -1;
  if (i >= 0) {
    const copy = rest.slice();
    const { client_id, ...clean } = msg; // eslint-disable-line no-unused-vars
    copy[i] = { ...rest[i], ...clean };
    return order(copy);
  }
  const { client_id, ...clean } = msg;
  return order([...rest, msg.pending ? msg : clean]);
}

export const markFailed = (list, clientId) =>
  list.map((m) => (m.pending && m.client_id === clientId ? { ...m, status: "failed" } : m));

export const removePending = (list, clientId) => list.filter((m) => !(m.pending && m.client_id === clientId));

export const newClientId = () =>
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
