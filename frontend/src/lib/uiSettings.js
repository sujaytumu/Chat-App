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

// Photos from other people: "always" (default) | "wifi" (only on Wi-Fi) | "never" (tap to download).
export const PHOTO_DOWNLOAD = [
  ["always", "Always", "Photos open on their own, on any connection"],
  ["wifi", "Wi-Fi only", "On mobile data, tap a photo to download it"],
  ["never", "Never", "Tap each photo to download it"],
];
export const getPhotoDownload = () => {
  try {
    const v = localStorage.getItem("talkies-photo-download");
    return PHOTO_DOWNLOAD.some(([k]) => k === v) ? v : "always";
  } catch {
    return "always";
  }
};
export const setPhotoDownload = (v) => {
  try {
    if (v === "always") localStorage.removeItem("talkies-photo-download");
    else localStorage.setItem("talkies-photo-download", v);
  } catch {
    /* storage unavailable */
  }
};
// Best guess whether this connection is Wi-Fi / wired. Browsers that cannot tell count as "yes", unless Data Saver is on.
export const onUnmeteredConnection = () => {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  if (!c) return true;
  if (c.type) return c.type === "wifi" || c.type === "ethernet";
  return !c.saveData;
};

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
