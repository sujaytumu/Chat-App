import { create } from "zustand";

// Per-chat bubble colour ("Chat theme"), kept on this device. Key = "d:<id>" / "g:<id>".
const KEY = "talkies-chat-colors";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

export const useChatColorStore = create((set, get) => ({
  map: read(),
  setColor: (key, id) => {
    const next = { ...get().map };
    if (id) next[key] = id;
    else delete next[key];
    set({ map: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  },
}));
