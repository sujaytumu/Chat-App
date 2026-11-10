// Quick replies: short saved messages the person can drop into any chat by typing "/".
// Kept on this device only (nothing is sent to the server until the message is sent).
const KEY = "talkies_quick_replies";
const DEFAULTS = [
  "I'm in a meeting, I'll call you back shortly.",
  "Can't talk right now. What's up?",
  "On my way!",
  "Thanks! 😊",
];

export const getQuickReplies = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULTS.slice();
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((t) => typeof t === "string" && t.trim()) : DEFAULTS.slice();
  } catch {
    return DEFAULTS.slice();
  }
};

export const saveQuickReplies = (list) => {
  const clean = [...new Set(list.map((t) => String(t).trim().slice(0, 300)).filter(Boolean))].slice(0, 30);
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* storage blocked — replies just won't persist */
  }
  return clean;
};
