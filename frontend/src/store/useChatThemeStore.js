import { create } from "zustand";

// Theme + font ("Customise"), like wallpapers: an ALL-CHATS default plus optional per-chat overrides.
// Per-chat values: null = same as all chats, "none" = plain (no theme / no font), else a theme/font id.
// Chat keys: "direct:<id>" / "group:<id>". `preview` = a look being tried in the sheet (not saved yet).
export const LOOKS_KEY = "talkies-chat-looks";
const LEGACY = "talkies-chat-themes";

const read = () => {
  try {
    const raw = localStorage.getItem(LOOKS_KEY);
    if (raw) {
      const v = JSON.parse(raw) || {};
      return { def: v.def || { theme: null, font: null }, chats: v.chats || {} };
    }
    const old = JSON.parse(localStorage.getItem(LEGACY) || "{}") || {}; // per-chat only, from before
    return { def: { theme: null, font: null }, chats: old };
  } catch {
    return { def: { theme: null, font: null }, chats: {} };
  }
};

const save = (def, chats) => {
  try {
    localStorage.setItem(LOOKS_KEY, JSON.stringify({ def, chats }));
  } catch {
    /* storage unavailable */
  }
};

export const useChatThemeStore = create((set, get) => ({
  ...read(),
  preview: null, // { scope, theme, font }

  // scope: "default" or a chat key
  apply: (scope, theme, font) => {
    const { def, chats } = get();
    if (scope === "default") {
      const nd = { theme: theme || null, font: font || null };
      set({ def: nd, preview: null });
      save(nd, chats);
      return;
    }
    const next = { ...chats };
    if (!theme && !font) delete next[scope];
    else next[scope] = { theme: theme || null, font: font || null };
    set({ chats: next, preview: null });
    save(def, next);
  },
  clearChats: () => {
    set({ chats: {}, preview: null });
    save(get().def, {});
  },
  reload: () => set({ ...read(), preview: null }),
  setPreview: (preview) => set({ preview }),
}));

// The theme/font ids in force for a chat (preview > chat override > all-chats default).
export const resolveLook = (s, chatKey) => {
  const p = s.preview && (s.preview.scope === "default" || s.preview.scope === chatKey) ? s.preview : null;
  let theme, font;
  if (p && p.scope === chatKey) ({ theme, font } = p);
  else {
    const c = s.chats[chatKey] || {};
    theme = c.theme;
    font = c.font;
  }
  const d = p && p.scope === "default" ? p : s.def;
  const pick = (v, dv) => (v === "none" ? null : v || dv || null);
  return { theme: pick(theme, d.theme), font: pick(font, d.font) };
};
