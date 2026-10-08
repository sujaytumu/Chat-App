// Remembers the last-known chat list on this device so the app can show it
// instantly on open (then refresh it in the background) instead of an empty
// skeleton while the server wakes up / the request is in flight.
// Keyed per user, and wiped on logout so nothing is left behind on shared devices.

const PREFIX = "talkies-cache-";

export function readChatCache(userId, name) {
  if (!userId) return null;
  try {
    return JSON.parse(localStorage.getItem(`${PREFIX}${name}-${userId}`) || "null");
  } catch {
    return null;
  }
}

export function writeChatCache(userId, name, value) {
  if (!userId) return;
  try {
    localStorage.setItem(`${PREFIX}${name}-${userId}`, JSON.stringify(value));
  } catch {
    // storage full / unavailable — caching is only an optimisation
  }
}

export function clearChatCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
