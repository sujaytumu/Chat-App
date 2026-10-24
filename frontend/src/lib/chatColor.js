// Chat colour: tints your own message bubbles (and "tint" surfaces). Kept per device.
const KEY = "talkies-chat-color";

export const CHAT_COLORS = [
  { id: "green", name: "WhatsApp", swatch: "#D9FDD3" },
  { id: "ocean", name: "Ocean", swatch: "#CDE8FF" },
  { id: "violet", name: "Violet", swatch: "#E4D9FF" },
  { id: "rose", name: "Rose", swatch: "#FFD9E4" },
  { id: "sunset", name: "Sunset", swatch: "#FFE5CC" },
  { id: "teal", name: "Lagoon", swatch: "#CCF4F0" },
  { id: "graphite", name: "Graphite", swatch: "#E2E5E9" },
];

export const getChatColor = () => {
  try {
    const v = localStorage.getItem(KEY);
    return CHAT_COLORS.some((c) => c.id === v) ? v : "green";
  } catch {
    return "green";
  }
};

export const applyChatColor = (id = getChatColor()) => {
  const el = document.documentElement;
  if (id === "green") el.removeAttribute("data-chat-color");
  else el.setAttribute("data-chat-color", id);
};

export const setChatColor = (id) => {
  try {
    if (id === "green") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
  applyChatColor(id);
};
