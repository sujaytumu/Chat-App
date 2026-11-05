// Pure helpers for messages that are still "sending" (the clock copy the app shows before the server confirms).
// Kept apart from the store so they can be tested on their own.

export const isTmp = (m) => typeof m?._id === "string" && m._id.startsWith("tmp-");

// Replace the clock copy (tmpId) by the confirmed message. A copy of the confirmed message that already arrived
// another way (a live update, a refresh) is merged into the same place, never shown twice.
// Returns the new list, or null when there was nothing to replace.
export function swapSent(list, tmpId, real) {
  if (!Array.isArray(list) || !real) return null;
  let used = false;
  const out = [];
  for (const m of list) {
    if (m._id === tmpId || m._id === real._id) {
      if (used) continue;
      used = true;
      out.push(real);
    } else out.push(m);
  }
  return used ? out : null;
}

// The server's copy carries the id the app made for the message (clientId): match by it.
export const settleByClientId = (list, real) => (real?.clientId ? swapSent(list, real.clientId, real) : null);

// A clock copy that is not being sent any more must not show a clock for ever: its confirmation reached the
// chat list but not this saved copy, or it was left over from an earlier visit. `isLive(id)` says whether the
// send is still going (or waiting in the outbox); the real message arrives with the next refresh.
export const dropStalePending = (list, isLive) => (Array.isArray(list) ? list.filter((m) => !(m.pending && isTmp(m) && !isLive(m._id))) : list);

// The chat list's preview, when the server's version of the latest message is now known.
export function settlePreview(lastMessage, fresh) {
  if (!lastMessage || !Array.isArray(fresh) || !fresh.length) return lastMessage;
  if (isTmp(lastMessage)) {
    const real = fresh.find((m) => m.clientId === lastMessage._id);
    return real ? { ...real } : lastMessage;
  }
  const last = fresh[fresh.length - 1];
  if (lastMessage._id === last._id || new Date(last.createdAt) > new Date(lastMessage.createdAt)) {
    return { ...lastMessage, ...last, pending: false, failed: false }; // the server's copy is never "sending"
  }
  return lastMessage;
}
