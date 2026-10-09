import { axiosInstance } from "./axios";
import { useThemeStore, applyTheme } from "../store/useThemeStore";
import { reloadWallpapers } from "./wallpaper";
import { applyUiSettings } from "./uiSettings";

// Look & sound settings follow the ACCOUNT, so the browser, the installed app
// and the Android app all show the same theme, wallpapers and tones (they each
// have their own localStorage, which is why they used to drift apart).
//
//   • On sign-in the saved account settings are applied to this device.
//   • If the account has none yet, this device's settings are uploaded.
//   • Afterwards any change here is uploaded a moment later.
export const SYNC_KEYS = [
  "chat-theme",
  "talkies-wallpapers",
  "talkies-wallpaper-off",
  "talkies-reduce-motion",
  "talkies-haptics-off",
  "talkies-message-sound-enabled",
  "talkies-call-ringtone-enabled",
  "talkies-call-tone",
  "talkies-message-tone",
  "talkies-group-tone",
  "talkies-vib-message",
  "talkies-vib-group",
  "talkies-vib-call",
];
const KEYSET = new Set(SYNC_KEYS);
const MAX_VALUE = 450 * 1024;

let applying = false; // true while writing server values locally (don't echo them back)
let started = false;
let timer = null;
const dirty = new Set();

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

// "custom" tones are files stored only on one device — never sync that choice.
const syncable = (k, v) => v !== null && v.length <= MAX_VALUE && !(k.endsWith("-tone") && v === "custom");

function flush() {
  timer = null;
  if (!dirty.size) return;
  const prefs = {};
  for (const k of dirty) {
    const v = get(k);
    prefs[k] = v !== null && syncable(k, v) ? v : null;
  }
  dirty.clear();
  axiosInstance.put("/auth/preferences", { prefs }).catch(() => {});
}

function markDirty(key) {
  if (applying || !KEYSET.has(key)) return;
  dirty.add(key);
  clearTimeout(timer);
  timer = setTimeout(flush, 1200);
}

// Notice writes to the synced keys (all our settings go through localStorage).
function watchStorage() {
  if (started) return;
  started = true;
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    set.call(this, k, v);
    if (this === window.localStorage) markDirty(k);
  };
  Storage.prototype.removeItem = function (k) {
    remove.call(this, k);
    if (this === window.localStorage) markDirty(k);
  };
}

function applyToApp() {
  const t = get("chat-theme") || "light";
  applyTheme(t);
  useThemeStore.setState({ theme: t });
  reloadWallpapers();
  applyUiSettings();
}

export async function syncPreferences() {
  watchStorage();
  try {
    const { data: server } = await axiosInstance.get("/auth/preferences");
    const hasServer = server && Object.keys(server).length > 0;
    if (!hasServer) {
      // First device to sign in: its settings become the account's.
      const prefs = {};
      for (const k of SYNC_KEYS) {
        const v = get(k);
        if (v !== null && syncable(k, v)) prefs[k] = v;
      }
      if (Object.keys(prefs).length) axiosInstance.put("/auth/preferences", { prefs }).catch(() => {});
      return;
    }
    applying = true;
    let changed = false;
    const upload = {};
    try {
      for (const k of SYNC_KEYS) {
        const v = server[k];
        if (typeof v === "string") {
          if (get(k) !== v) {
            localStorage.setItem(k, v);
            changed = true;
          }
        } else if (get(k) !== null && syncable(k, get(k))) {
          // This device has a choice the account doesn't know yet — keep it and share it.
          upload[k] = get(k);
        }
      }
    } finally {
      applying = false;
    }
    if (Object.keys(upload).length) axiosInstance.put("/auth/preferences", { prefs: upload }).catch(() => {});
    if (changed) applyToApp();
  } catch {
    /* offline: keep what this device has */
  }
}
