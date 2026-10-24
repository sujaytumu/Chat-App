import { create } from "zustand";

// Unsent text per chat, kept on this device. Key = "d:<id>" / "g:<id>".
const KEY = "talkies-drafts";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

export const draftKey = (chat) => (chat ? `${chat.type === "group" ? "g" : "d"}:${chat.data._id}` : null);

export const useDraftStore = create((set, get) => ({
  drafts: read(),
  setDraft: (key, text) => {
    if (!key) return;
    const has = !!text && !!text.trim();
    if (!has && !get().drafts[key]) return;
    const next = { ...get().drafts };
    if (has) next[key] = text;
    else delete next[key];
    set({ drafts: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full / blocked: the draft just won't survive a reload */
    }
  },
}));
