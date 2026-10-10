// Small per-device display preferences (kept in localStorage).
const KEYS = {
  reduceMotion: "talkies-reduce-motion",
  wallpaperOff: "talkies-wallpaper-off",
  hapticsOff: "talkies-haptics-off",
  enterNewline: "talkies-enter-newline",
};

const read = (k) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const write = (k, on) => {
  try {
    if (on) localStorage.setItem(k, "1");
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
};

export const getReduceMotion = () => read(KEYS.reduceMotion);
export const getWallpaper = () => !read(KEYS.wallpaperOff);
export const getHaptics = () => !read(KEYS.hapticsOff);
// "Enter is send": on (default) Enter sends; off makes Enter a new line (Ctrl/Cmd+Enter then sends).
export const getEnterSends = () => !read(KEYS.enterNewline);
export const setEnterSends = (on) => write(KEYS.enterNewline, !on);

// Message text size: "small" | "default" | "large" | "huge"
export const FONT_SIZES = [
  ["small", "Small"],
  ["default", "Default"],
  ["large", "Large"],
  ["huge", "Extra large"],
];
export const getFontSize = () => {
  try {
    const v = localStorage.getItem("talkies-font-size");
    return FONT_SIZES.some(([k]) => k === v) ? v : "default";
  } catch {
    return "default";
  }
};
export const setFontSize = (v) => {
  try {
    if (v === "default") localStorage.removeItem("talkies-font-size");
    else localStorage.setItem("talkies-font-size", v);
  } catch {
    /* storage unavailable */
  }
  applyUiSettings();
};

export function applyUiSettings() {
  const fs = getFontSize();
  if (fs === "default") document.documentElement.removeAttribute("data-font");
  else document.documentElement.setAttribute("data-font", fs);
  const cl = document.documentElement.classList;
  cl.toggle("reduce-motion", getReduceMotion());
  cl.toggle("no-wallpaper", !getWallpaper());
}

export const setReduceMotion = (on) => {
  write(KEYS.reduceMotion, on);
  applyUiSettings();
};
export const setWallpaper = (on) => {
  write(KEYS.wallpaperOff, !on);
  applyUiSettings();
};
export const setHaptics = (on) => write(KEYS.hapticsOff, !on);

// Used for long-press feedback etc. — respects the Vibration switch.
export const buzz = (ms = 15) => {
  if (getHaptics()) navigator.vibrate?.(ms);
};
