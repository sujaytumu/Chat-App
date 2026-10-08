// Notification / ringtone sounds. Built-in tones are synthesized with the
// Web Audio API so we don't need to ship/license audio assets; people can also
// pick their own sound file in Settings (played through an <audio> element).
import {
  isMessageSoundEnabled,
  isCallRingtoneEnabled,
  getCallTone,
  getMessageTone,
  loadCustomTone,
} from "./soundSettings";

let audioCtx;
let audioUnlocked = false;

// A 0-sample WAV, used to "unlock" <audio> elements inside a user gesture.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

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

// Android phones can vibrate with the ring (iOS Safari has no vibration API).
const RING_VIBRATION = [700, 400, 700, 400];
export function vibrateForCall() {
  try {
    navigator.vibrate?.(RING_VIBRATION);
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
  el.src = url;
  el.currentTime = 0;
  return el.play();
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
export function playNotificationSound() {
  if (!isMessageSoundEnabled()) return;
  playMessageTone(getMessageTone());
}

async function playMessageTone(id) {
  if (id === "custom") {
    const url = await loadCustomTone("message");
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
export function startRingtone() {
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

export function stopRingtoneSound() {
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
export function stopTonePreview() {
  clearTimeout(previewTimer);
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
      previewTimer = setTimeout(() => stopElement(ringEl), 5000);
      return true;
    } catch {
      return false;
    }
  }
  playPresetOnce(CALL_PRESETS, id, "classic");
  return true;
}

export async function previewMessageTone(id) {
  primeAudio();
  stopTonePreview();
  if (id === "custom") {
    const url = await loadCustomTone("message");
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
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const { data } = await axiosInstance.get("/push/vapid-public-key");
    if (!data.publicKey) return; // backend not configured with VAPID keys yet

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    await axiosInstance.post("/push/subscribe", subscription.toJSON());
  } catch (err) {
    console.log("Push subscription failed:", err.message);
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
