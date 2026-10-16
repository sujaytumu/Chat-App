import { create } from "zustand";

// Per-chat theme + font ("Customise"), kept on this device. Key = "direct:<id>" / "group:<id>".
// preview = a theme being tried out in the sheet (not saved until Apply).
const KEY = "talkies-chat-themes";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

export const useChatThemeStore = create((set, get) => ({
  map: read(), // { [chatKey]: { theme: id|null, font: id|null } }
  preview: null, // { chatKey, theme, font }

  apply: (chatKey, theme, font) => {
    const next = { ...get().map };
    if (!theme && !font) delete next[chatKey];
    else next[chatKey] = { theme: theme || null, font: font || null };
    set({ map: next, preview: null });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  },
  setPreview: (preview) => set({ preview }),
}));
