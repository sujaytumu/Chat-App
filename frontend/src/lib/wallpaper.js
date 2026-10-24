import { create } from "zustand";

// Chat wallpapers, kept on this device: one default for every chat, plus an
// optional different one for a particular chat (a chat's own wins).
//   { kind: "color", value: "#D9FDD3" }  or  { kind: "image", value: "<data url>" }
// No entry = the standard doodle pattern.
const KEY = "talkies-wallpapers"; // { def: cfg|null, chats: { "direct:<id>"|"group:<id>": cfg } }

export const WALLPAPER_COLORS = [
  "#EFEAE2", "#D9FDD3", "#DCF0FF", "#FDE7EF", "#FFF4D1", "#E5DDFB",
  "#CFE9E3", "#FFFFFF", "#0B141A", "#1F2C34", "#26333C", "#2B2142",
];

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { def: d.def || null, chats: d.chats || {} };
  } catch {
    return { def: null, chats: {} };
  }
};

// Returns false if the browser refused to store it (picture too big).
const save = (state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ def: state.def, chats: state.chats }));
    return true;
  } catch {
    return false;
  }
};

export const useWallpaperStore = create((set, get) => ({
  ...load(),

  // scope: "default" or a chat key like "group:<id>"
  setWallpaper: (scope, cfg) => {
    const prev = { def: get().def, chats: get().chats };
    const next = scope === "default" ? { ...prev, def: cfg } : { ...prev, chats: { ...prev.chats, [scope]: cfg } };
    if (!save(next)) return false;
    set(next);
    return true;
  },

  clearWallpaper: (scope) => {
    const prev = { def: get().def, chats: { ...get().chats } };
    if (scope === "default") prev.def = null;
    else delete prev.chats[scope];
    save(prev);
    set(prev);
  },

  clearAllChatWallpapers: () => {
    const next = { def: get().def, chats: {} };
    save(next);
    set(next);
  },
}));

export const reloadWallpapers = () => useWallpaperStore.setState(load());

export const cfgToStyle = (cfg) => {
  if (!cfg) return undefined;
  if (cfg.kind === "color") return { backgroundColor: cfg.value, backgroundImage: "none" };
  if (cfg.kind === "image") {
    return { backgroundImage: `url(${cfg.value})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" };
  }
  return undefined;
};

// Style for the chat background: this chat's own wallpaper, else the default.
export function useChatWallpaperStyle(chatKey) {
  const own = useWallpaperStore((s) => (chatKey ? s.chats[chatKey] : null));
  const def = useWallpaperStore((s) => s.def);
  return cfgToStyle(own || def);
}
