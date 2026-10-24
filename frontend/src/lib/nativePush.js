// Android app only (the Capacitor shell): register this phone for Firebase push
// so calls ring and messages arrive even when the app is closed, and route
// notification taps (Answer / open chat) into the app.
import { axiosInstance } from "./axios";
import { handleNotificationAction } from "./notificationActions";

const plugin = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesPush : null);

export const isNativeApp = () => !!plugin();

let registeredFor = null;
let currentUser = null;
let watching = false;
let registering = false;

// Registers this phone's push token with the server, retrying a few times if the server is slow.
async function ensureRegistered(userId) {
  const p = plugin();
  if (!p || registering) return;
  registering = true;
  try {
    for (const wait of [0, 3000, 10000, 30000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const { token } = await p.getToken();
        if (!token) return; // Firebase isn't configured in this build
        if (registeredFor === `${userId}:${token}`) return;
        await axiosInstance.post("/push/fcm-register", { token });
        registeredFor = `${userId}:${token}`;
        return;
      } catch {
        /* try again */
      }
    }
  } finally {
    registering = false;
  }
}
let listening = false;
let lastIntentTs = 0;

// Hands a notification tap (Answer / open chat) to the app. The same tap can arrive twice (launch
// intent + live event) or be old: act once, and never on something older than a minute and a half.
function deliverIntent(intent, goHome) {
  if (!intent) return;
  if (intent.ts) {
    if (intent.ts === lastIntentTs || Date.now() - intent.ts > 90_000) return;
    lastIntentTs = intent.ts;
  }
  handleNotificationAction({ action: intent.action || "open", data: intent }, goHome);
}

// Picks up an "Answer" tapped on the call notification AS SOON AS the page starts — before login /
// the socket are ready — so the "Connecting your call…" screen shows at once and the call is taken
// the moment it arrives, instead of showing the home screen first.
export async function consumeLaunchIntentEarly() {
  const p = plugin();
  if (!p) return;
  try {
    const { intent } = (await p.getLaunchIntent?.()) || {};
    deliverIntent(intent);
  } catch {
    /* ignore */
  }
}

// Coming back to the app (e.g. after tapping Answer on the notification while it was asleep): check
// again, so an Answer that arrived while the page was frozen is never missed.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") consumeLaunchIntentEarly();
  });
}

export async function registerNativePush(userId, goHome) {
  const p = plugin();
  if (!p) return;

  // Hand the notification's action (Answer / open chat) to the app FIRST. Registering for push
  // can take many seconds (permission prompt, server waking up); waiting for it used to leave
  // "Answer" unhandled so the call had to be picked up a second time inside the app.
  const deliver = (intent) => deliverIntent(intent, goHome);
  try {
    const { intent } = (await p.getLaunchIntent?.()) || {};
    deliver(intent);
  } catch {
    /* ignore */
  }
  try {
    if (!listening) {
      listening = true;
      p.addListener?.("nativeIntent", deliver);
    }
  } catch {
    /* ignore */
  }

  try {
    await p.requestPermission?.();
    // Android shows one permission prompt at a time and silently drops a second request made while
    // the first is on screen — which is how the microphone prompt was being skipped. Wait, then ask.
    await new Promise((r) => setTimeout(r, 2500));
    // Mic / camera up front so "Answer" never stops at a permission prompt.
    await p.requestCallPermissions?.();
  } catch {
    /* ignore */
  }
  // hand the chosen call tone to the app so the ringing notification uses it too (closed app)
  import("./soundSettings").then((m) => m.syncNativeCallTone()).catch(() => {});
  await ensureRegistered(userId);
  currentUser = userId;
  if (!watching) {
    watching = true;
    // A failed sign-up with the push service (server asleep, no signal) or a rotated token must never
    // leave this phone without background calls: check again whenever the app comes back.
    const again = () => currentUser && ensureRegistered(currentUser);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && again());
    window.addEventListener("online", again);
  }
}

export async function unregisterNativePush() {
  const p = plugin();
  if (!p) return;
  try {
    const { token } = await p.getToken();
    if (token) await axiosInstance.post("/push/fcm-unregister", { token });
  } catch {
    /* ignore */
  }
  registeredFor = null;
  currentUser = null;
}

// For the "background calls" check: forget what was registered and sign this phone up again.
export async function forceRegisterNativePush(userId) {
  registeredFor = null;
  await ensureRegistered(userId);
}
