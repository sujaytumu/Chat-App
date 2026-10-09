import { axiosInstance } from "./axios";
import { useThemeStore } from "../store/useThemeStore";
import { applyUiSettings } from "./uiSettings";
import { syncPrefsToWorker } from "./soundSettings";

// Appearance + sound choices live in localStorage, which is separate per
// browser / installed app / Android app — so the same account looked different
// on each. They're now mirrored to the account: whatever you set up once shows
// up everywhere. (Custom ringtone FILES stay on the device they were added on.)
export const PREF_KEYS = [
  "chat-theme",
  "talkies-reduce-motion",
  "talkies-wallpaper-off",
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

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export function collectPrefs() {
  const out = {};
  PREF_KEYS.forEach((k) => {
    const v = get(k);
    if (v !== null) out[k] = v;
  });
  return out;
}

function applyPrefs(prefs) {
  try {
    PREF_KEYS.forEach((k) => {
      if (k === "chat-theme") return;
      if (typeof prefs[k] === "string") localStorage.setItem(k, prefs[k]);
      else localStorage.removeItem(k);
    });
  } catch {
    /* storage unavailable */
  }
  const theme = typeof prefs["chat-theme"] === "string" ? prefs["chat-theme"] : "light";
  if (useThemeStore.getState().theme !== theme) useThemeStore.getState().setTheme(theme);
  else if (typeof prefs["chat-theme"] === "string") {
    try {
      localStorage.setItem("chat-theme", theme);
    } catch {
      /* ignore */
    }
  }
  applyUiSettings();
  syncPrefsToWorker();
}

// Start keeping this device in step with the account. Returns a cleanup function.
export function startPrefsSync() {
  let last = "";
  let stopped = false;

  const pull = async (first) => {
    try {
      const { data } = await axiosInstance.get("/auth/ui-prefs");
      if (stopped) return;
      const server = data.uiPrefs || {};
      const local = collectPrefs();
      if (Object.keys(server).length) {
        if (JSON.stringify(server) !== JSON.stringify(local)) applyPrefs(server);
        last = JSON.stringify(collectPrefs());
      } else if (first && Object.keys(local).length) {
        // Account has nothing saved yet, this device has choices -> they become the account's
        last = JSON.stringify(local);
        axiosInstance.put("/auth/ui-prefs", { prefs: local }).catch(() => {
          last = "";
        });
      } else {
        last = JSON.stringify(local);
      }
    } catch {
      /* offline — try again later */
    }
  };

  pull(true);

  // Push local changes shortly after they happen
  const timer = setInterval(() => {
    if (!last) return;
    const now = collectPrefs();
    const json = JSON.stringify(now);
    if (json === last) return;
    last = json;
    axiosInstance.put("/auth/ui-prefs", { prefs: now }).catch(() => {
      last = "";
      pull(false);
    });
  }, 3000);

  // Pick up changes made on another device when coming back to the app
  const onVisible = () => document.visibilityState === "visible" && pull(false);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
