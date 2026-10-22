// Notification / ringtone sounds. Built-in tones are synthesized with the
// Web Audio API so we don't need to ship/license audio assets; people can also
// pick their own sound file in Settings (played through an <audio> element).
import {
  isMessageSoundEnabled,
  isCallRingtoneEnabled,
  getCallTone,
  getMessageTone,
  getGroupTone,
  vibrationPattern,
  loadCustomTone,
} from "./soundSettings";

let audioCtx;
let audioUnlocked = false;

// A 0-sample WAV, used to "unlock" <audio> elements inside a user gesture.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// The Talkies tune shipped with the app (the same file the Android notification rings with), so a
// call sounds identical whether the phone is locked, in the background or the app is open.
const TALKIES_RING_URL = "/talkies_ring.ogg";

let ringEl = null; // looping call ringtone (custom files)
let msgEl = null; // one-shot message sound (custom files)
let elementsUnlocked = false;

function ensureElements() {
  if (typeof Audio === "undefined") return;
  if (!ringEl) {
    ringEl = new Audio();
    ringEl.preload = "auto";
    ringEl.loop = true;
  }
  if (!msgEl) {
    msgEl = new Audio();
    msgEl.preload = "auto";
  }
}

// Phones only allow programmatic <audio> playback once the element has been
// played from a real tap. Do that with a silent clip on the first gesture so
// a ring/message that arrives later can actually be heard.
function unlockElements() {
  if (elementsUnlocked) return;
  ensureElements();
  if (!ringEl || !msgEl) return;
  elementsUnlocked = true;
  [ringEl, msgEl].forEach((el) => {
    const prev = { src: el.src, loop: el.loop };
    el.muted = true;
    el.loop = false;
    el.src = SILENT_WAV;
    el.play()
      .then(() => {
        el.pause();
      })
      .catch(() => {
        elementsUnlocked = false; // try again on the next gesture
      })
      .finally(() => {
        el.muted = false;
        el.loop = prev.loop;
        if (prev.src && !prev.src.startsWith("data:audio/wav")) el.src = prev.src;
      });
  });
}

// Browsers block Web Audio until a genuine user gesture (click/keydown/tap)
// happens on the page. Call this on that first gesture so the AudioContext
// is already running by the time a notification sound is actually needed —
// otherwise the very first notification after page load can play silently.
export function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    // iOS Safari can leave the context "interrupted" (after a call, lock
    // screen, or switching apps) as well as "suspended" — resume both.
    if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});

    // iOS only fully unlocks Web Audio once something has actually been
    // *played* inside a user gesture, so push one silent sample through.
    if (!audioUnlocked) {
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      audioUnlocked = true;
    }
  } catch {
    // ignore
  }
  unlockElements();
}

// Phones (iOS especially) suspend the audio context when the app is
// backgrounded; make sure it is running again as soon as the page is
// visible so the next incoming call can actually ring.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().catch(() => {});
    }
  });
}

// ---- Who alerts: the page or the system? -----------------------------------
// When Web Push is set up on this device the service worker shows a system
// notification for anything that arrives while the app isn't in front. On a
// phone a background page is frozen and can't play sound, so the system
// notification must do the alerting and the page stays quiet (otherwise: two
// sounds). On desktop a hidden page is still alive, so it plays the person's
// chosen tone and the system notification is shown silently.
let pushActive = false;
export function setPushActive(active) {
  pushActive = !!active;
}
export function isPushActive() {
  return pushActive;
}
const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
export function shouldLeaveToSystemAlert() {
  return pushActive && document.visibilityState !== "visible" && isMobileDevice();
}

export function vibrateForCall() {
  try {
    const pattern = vibrationPattern("call");
    if (pattern) navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}
// One short buzz when a call connects (after the ringing buzz has been stopped), so the person feels
// the call has been picked up.
export function signalCallConnected() {
  stopRingtoneSound();
  try {
    navigator.vibrate?.(0);
    setTimeout(() => navigator.vibrate?.(160), 60);
  } catch {
    // ignore
  }
}
export function stopVibration() {
  try {
    navigator.vibrate?.(0);
  } catch {
    // ignore
  }
}

// ---- Built-in tones --------------------------------------------------------
// Each step: { freq, endFreq?, start, dur, gain?, type?, pluck? }
//  - pluck: quick exponential decay (bell/pop); otherwise a sustained note with
//    a short attack and release.

function scheduleSteps(steps) {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  const now = audioCtx.currentTime;

  steps.forEach(({ freq, endFreq, start, dur, gain: peak = 0.15, type = "sine", pluck = false }) => {
    const t0 = now + start;
    const t1 = t0 + dur;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t1);

    gain.gain.setValueAtTime(0, t0);
    if (pluck) {
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t1);
    } else {
      const release = Math.min(0.15, dur / 2);
      gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.05, dur / 4));
      gain.gain.setValueAtTime(peak, t1 - release);
      gain.gain.linearRampToValueAtTime(0, t1);
    }

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.05);
  });
}

const notes = (freqs, gap, dur, extra = {}) =>
  freqs.map((freq, i) => ({ freq, start: i * gap, dur, ...extra }));

// One ring cycle each (the caller repeats every 2s).
const CALL_PRESETS = {
  // Classic dual-tone phone ring: two close frequencies, ~1s on / ~1s off.
  classic: [
    { freq: 440, start: 0, dur: 1.0, gain: 0.13 },
    { freq: 480, start: 0, dur: 1.0, gain: 0.13 },
  ],
  digital: notes([1000, 1000, 1000], 0.25, 0.14, { gain: 0.08, type: "square" }),
  chime: notes([523.25, 659.25, 783.99, 1046.5], 0.2, 0.7, { gain: 0.16, pluck: true }),
  marimba: [
    ...notes([392, 493.88, 587.33, 783.99], 0.2, 0.5, { gain: 0.2, type: "triangle", pluck: true }),
    ...notes([587.33, 493.88, 392], 0.2, 0.5, { gain: 0.2, type: "triangle", pluck: true }).map((n) => ({
      ...n,
      start: n.start + 1.0,
    })),
  ],
  trill: Array.from({ length: 14 }, (_, i) => ({
    freq: i % 2 ? 1000 : 800,
    start: i * 0.065,
    dur: 0.06,
    gain: 0.1,
  })),
};

const MESSAGE_PRESETS = {
  ding: [
    { freq: 880, start: 0, dur: 0.12, gain: 0.15, pluck: true },
    { freq: 1175, start: 0.1, dur: 0.18, gain: 0.15, pluck: true },
  ],
  pop: [{ freq: 700, endFreq: 250, start: 0, dur: 0.12, gain: 0.25, pluck: true }],
  chime: [
    { freq: 1046.5, start: 0, dur: 0.4, gain: 0.13, pluck: true },
    { freq: 1318.5, start: 0.12, dur: 0.5, gain: 0.13, pluck: true },
  ],
  bubble: [
    { freq: 400, endFreq: 900, start: 0, dur: 0.15, gain: 0.18, pluck: true },
    { freq: 500, endFreq: 1100, start: 0.12, dur: 0.15, gain: 0.18, pluck: true },
  ],
  knock: [
    { freq: 180, start: 0, dur: 0.1, gain: 0.35, type: "triangle", pluck: true },
    { freq: 180, start: 0.14, dur: 0.1, gain: 0.35, type: "triangle", pluck: true },
  ],
};

// ---- Playback --------------------------------------------------------------

let ringToken = 0; // invalidates an in-flight start if the ring is stopped first
let ringVibrateInterval = null;
let ringSoundInterval = null;
let previewTimer = null;
let msgStopTimer = null;

function playElement(el, url, { loop }) {
  ensureElements();
  el.loop = loop;
  el.muted = false;
  el.volume = 1; // full level: the loudness itself comes from the (normalised) tune file
  el.src = url;
  el.currentTime = 0;
  return el.play();
}

// True while the incoming-call ring is genuinely audible/running. Phones pause <audio> when the app
// goes to the background, so "I started it earlier" is not proof it is still playing.
export function isRingtoneActive() {
  if (ringSoundInterval) return true;
  return !!ringEl && !ringEl.paused && !ringEl.ended && ringEl.src && !ringEl.src.startsWith("data:audio/wav");
}

function stopElement(el) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    // ignore
  }
}

function playPresetOnce(table, id, fallbackId) {
  try {
    scheduleSteps(table[id] || table[fallbackId]);
  } catch {
    // Audio isn't critical — fail silently (e.g. autoplay policy blocks it
    // until the user has interacted with the page once).
  }
}

// Message sound (respects the on/off setting).
export function playNotificationSound(isGroup = false) {
  if (!isMessageSoundEnabled()) return;
  if (isGroup) {
    const g = getGroupTone();
    if (g === "none") return; // groups set to Silent
    if (g !== "same") {
      playMessageTone(g, "group");
      return;
    }
  }
  playMessageTone(getMessageTone());
}

async function playMessageTone(id, kind = "message") {
  if (id === "custom") {
    const url = await loadCustomTone(kind);
    if (url) {
      try {
        ensureElements();
        await playElement(msgEl, url, { loop: false });
        clearTimeout(msgStopTimer);
        msgStopTimer = setTimeout(() => stopElement(msgEl), 6000); // cap long files
        return;
      } catch {
        // fall back to the built-in sound below
      }
    }
    playPresetOnce(MESSAGE_PRESETS, "ding", "ding");
    return;
  }
  playPresetOnce(MESSAGE_PRESETS, id, "ding");
}

// Incoming-call ringing: sound (built-in tone repeating every 2s, or the
// person's own file looping) plus vibration. Call stopRingtoneSound() to end.
export function startRingtone({ keepIfPlaying = false } = {}) {
  // Already ringing: carry on from where the tune is instead of starting it over.
  if (keepIfPlaying && isRingtoneActive()) return;
  stopRingtoneSound();
  const token = ++ringToken;
  vibrateForCall();
  ringVibrateInterval = setInterval(vibrateForCall, 2000);

  if (!isCallRingtoneEnabled()) return; // silent mode still buzzes

  const startPreset = (id) => {
    playPresetOnce(CALL_PRESETS, id, "classic");
    ringSoundInterval = setInterval(() => playPresetOnce(CALL_PRESETS, id, "classic"), 2000);
  };

  const toneId = getCallTone();
  if (toneId === "talkies") {
    ensureElements();
    playElement(ringEl, TALKIES_RING_URL, { loop: true }).catch(() => {
      if (token === ringToken) startPreset("classic"); // blocked / not loadable: still ring
    });
    return;
  }
  if (toneId !== "custom") {
    startPreset(toneId);
    return;
  }

  loadCustomTone("call").then(async (url) => {
    if (token !== ringToken) return; // ring was stopped while loading
    if (url) {
      try {
        ensureElements();
        await playElement(ringEl, url, { loop: true });
        return;
      } catch {
        // blocked or undecodable — fall back to the built-in ring
      }
    }
    if (token === ringToken) startPreset("classic");
  });
}

// ---- Caller-side tones (what the person placing the call hears) ----------
//  calling: one short tap every few seconds (connecting, their phone hasn't rung yet)
//  ringing: two quick taps every few seconds (their phone is ringing)
//  busy:    one long, lower tone, a few times (they are on another call)
let backTimer = null;
let backStopTimer = null;
let backToken = 0;

const TAP = { freq: 440, dur: 0.38, gain: 0.12, type: "sine" };
const CALLING_STEPS = [{ ...TAP, start: 0 }];
const RINGING_STEPS = [{ ...TAP, start: 0 }, { ...TAP, start: 0.55 }];
const BUSY_STEPS = [
  { freq: 480, dur: 0.9, gain: 0.12, type: "sine", start: 0 },
  { freq: 620, dur: 0.9, gain: 0.08, type: "sine", start: 0 },
];

function startPattern(steps, periodMs, maxMs) {
  stopRingback();
  if (!isCallRingtoneEnabled()) return;
  const token = backToken;
  const play = () => {
    if (token !== backToken) return;
    try {
      scheduleSteps(steps);
    } catch {
      // audio blocked: never critical
    }
  };
  play();
  backTimer = setInterval(play, periodMs);
  if (maxMs) backStopTimer = setTimeout(() => { if (token === backToken) stopRingback(); }, maxMs);
}

export function startCallingTone() { startPattern(CALLING_STEPS, 3000); }
export function startRingback() { startPattern(RINGING_STEPS, 3500); }
export function startBusyTone() { startPattern(BUSY_STEPS, 1500, 4300); }

export function stopRingback() {
  backToken++;
  clearInterval(backTimer);
  clearTimeout(backStopTimer);
  backTimer = null;
  backStopTimer = null;
}

export function stopRingtoneSound() {
  stopRingback();
  ringToken++;
  clearInterval(ringVibrateInterval);
  clearInterval(ringSoundInterval);
  ringVibrateInterval = null;
  ringSoundInterval = null;
  stopElement(ringEl);
  stopVibration();
}

// Settings previews — play the given tone once regardless of the on/off
// switches, so people can hear what they're choosing.
const PREVIEW_MS = 10000; // call tones preview for 10 seconds
export function stopTonePreview() {
  clearTimeout(previewTimer);
  clearInterval(ringSoundInterval);
  ringSoundInterval = null;
  clearTimeout(msgStopTimer);
  stopElement(ringEl);
  stopElement(msgEl);
}

export async function previewCallTone(id) {
  primeAudio();
  stopTonePreview();
  if (id === "custom") {
    const url = await loadCustomTone("call");
    if (!url) return false;
    try {
      ensureElements();
      await playElement(ringEl, url, { loop: true });
      previewTimer = setTimeout(() => stopElement(ringEl), PREVIEW_MS);
      return true;
    } catch {
      return false;
    }
  }
  if (id === "talkies") {
    try {
      ensureElements();
      await playElement(ringEl, TALKIES_RING_URL, { loop: true });
      previewTimer = setTimeout(() => stopElement(ringEl), PREVIEW_MS);
      return true;
    } catch {
      return false;
    }
  }
  // built-in tones: repeat the ring cycle (every 2 s) for the whole preview
  playPresetOnce(CALL_PRESETS, id, "classic");
  let n = 1;
  ringSoundInterval = setInterval(() => {
    if (++n > PREVIEW_MS / 2000) return stopTonePreview();
    playPresetOnce(CALL_PRESETS, id, "classic");
  }, 2000);
  return true;
}

export async function previewMessageTone(id, kind = "message") {
  primeAudio();
  stopTonePreview();
  if (id === "custom") {
    const url = await loadCustomTone(kind);
    if (!url) return false;
    try {
      ensureElements();
        await playElement(msgEl, url, { loop: false });
      previewTimer = setTimeout(() => stopElement(msgEl), 5000);
      return true;
    } catch {
      return false;
    }
  }
  playPresetOnce(MESSAGE_PRESETS, id, "ding");
  return true;
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Registers the service worker and subscribes the browser to Web Push, so
// this device keeps getting notified even when the site/tab is fully closed
// (as long as the browser/OS is running). Safe to call repeatedly.
export async function registerPushSubscription(axiosInstance) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const { data } = await axiosInstance.get("/push/vapid-public-key");
    if (!data.publicKey) return false; // backend not configured with VAPID keys yet
    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    const subscribe = () => registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await subscribe();
    } else {
      // A subscription made with a different server key (keys were rotated)
      // silently never receives anything — replace it.
      const current = subscription.options?.applicationServerKey;
      if (current && current.byteLength === applicationServerKey.byteLength) {
        const a = new Uint8Array(current);
        if (a.some((byte, i) => byte !== applicationServerKey[i])) {
          await subscription.unsubscribe();
          subscription = await subscribe();
        }
      }
    }

    await axiosInstance.post("/push/subscribe", subscription.toJSON());
    setPushActive(true);
    return true;
  } catch (err) {
    console.log("Push subscription failed:", err.message);
    return false;
  }
}

export function showDesktopNotification(title, options) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // ignore
  }
}

// ---- The phone's own ring (Android app) -------------------------------------
// In the Android app an incoming call rings from a system notification, on the phone's real ringtone
// volume (a web page can only play sound at the quieter media volume). The page asks whether that
// ring is going, and tells it to stop the moment the call is answered / declined / over.
const nativePhone = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesPush : null);

export function hasPhoneRing() {
  return !!nativePhone();
}

export async function isPhoneRinging() {
  try {
    const p = nativePhone();
    if (!p?.isCallRinging) return false;
    return !!(await p.isCallRinging())?.ringing;
  } catch {
    return false; // older app build without the method: ring in the page as before
  }
}

export function stopPhoneRing() {
  try {
    const r = nativePhone()?.stopCallRing?.();
    if (r && typeof r.catch === "function") r.catch(() => {});
  } catch {
    // ignore
  }
}
