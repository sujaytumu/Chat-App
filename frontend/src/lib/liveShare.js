// The live-location messages I am currently sharing (message id + when each one ends).
// Kept in localStorage so sharing carries on after the page reloads; plain JS, no native plugin.
const KEY = "talkies.liveShares";
let shares = null;
const listeners = new Set();

const load = () => {
  if (shares) return shares;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    shares = Array.isArray(raw) ? raw.filter((s) => s?.id && Number(s.expiresAt) > Date.now()) : [];
  } catch {
    shares = [];
  }
  return shares;
};
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(shares));
  } catch {
    /* storage unavailable: sharing still works until the page closes */
  }
  listeners.forEach((fn) => fn(shares));
};

export const liveShares = {
  list: () => load().filter((s) => s.expiresAt > Date.now()),
  expired: () => load().filter((s) => s.expiresAt <= Date.now()),
  has: (id) => load().some((s) => s.id === id && s.expiresAt > Date.now()),
  add(id, expiresAt) {
    const t = new Date(expiresAt).getTime();
    if (!id || !Number.isFinite(t)) return;
    load();
    shares = [...shares.filter((s) => s.id !== id), { id, expiresAt: t }];
    save();
  },
  remove(id) {
    load();
    if (!shares.some((s) => s.id === id)) return;
    shares = shares.filter((s) => s.id !== id);
    save();
  },
  prune() {
    load();
    const next = shares.filter((s) => s.expiresAt > Date.now());
    if (next.length !== shares.length) {
      shares = next;
      save();
    }
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
