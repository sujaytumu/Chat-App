import { create } from "zustand";

// Which side of the Reels screen is open: the photo "feed" or the "reels" videos.
// Shared so the bottom bar can show Feed and Reels as two separate buttons.
export const useReelsModeStore = create((set) => ({
  mode: "reels",
  setMode: (mode) => set({ mode }),
}));
