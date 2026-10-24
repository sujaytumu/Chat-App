// Remembers who each just-sent direct message was from / to for a few minutes, so the receiving
// phone's "got it" and "read it" can reach the sender instantly — without first looking the message
// up in the database.
const TTL_MS = 10 * 60_000;
const MAX = 20_000;
const recent = new Map(); // messageId -> { senderId, receiverId, createdAt, at }

export function rememberMessage(m) {
  if (recent.size >= MAX) recent.delete(recent.keys().next().value);
  recent.set(String(m._id), { senderId: String(m.senderId), receiverId: String(m.receiverId), createdAt: m.createdAt, at: Date.now() });
}
export function recallMessage(id) {
  const r = recent.get(String(id));
  if (!r) return null;
  if (Date.now() - r.at > TTL_MS) {
    recent.delete(String(id));
    return null;
  }
  return r;
}
