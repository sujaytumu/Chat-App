const MESSAGE_SOUND_KEY = "talkies-message-sound-enabled";
const CALL_RINGTONE_KEY = "talkies-call-ringtone-enabled";
const CALL_TONE_KEY = "talkies-call-tone";
const MESSAGE_TONE_KEY = "talkies-message-tone";
const CUSTOM_NAME_KEY_PREFIX = "talkies-custom-tone-name-";

export function isMessageSoundEnabled() {
  return localStorage.getItem(MESSAGE_SOUND_KEY) !== "false"; // default on
}
export function setMessageSoundEnabled(enabled) {
  localStorage.setItem(MESSAGE_SOUND_KEY, String(enabled));
}

export function isCallRingtoneEnabled() {
  return localStorage.getItem(CALL_RINGTONE_KEY) !== "false"; // default on
}
export function setCallRingtoneEnabled(enabled) {
  localStorage.setItem(CALL_RINGTONE_KEY, String(enabled));
}

// ---- Tone choices ----------------------------------------------------------
// Built-in tones are synthesized in notificationSound.js (no audio assets to
// ship). "custom" means a sound file the person picked from their device.

export const CALL_TONES = [
  { id: "classic", label: "Classic ring" },
  { id: "digital", label: "Digital beeps" },
  { id: "chime", label: "Chime" },
  { id: "marimba", label: "Marimba" },
  { id: "trill", label: "Old phone trill" },
];

export const MESSAGE_TONES = [
  { id: "ding", label: "Ding" },
  { id: "pop", label: "Pop" },
  { id: "chime", label: "Chime" },
  { id: "bubble", label: "Bubble" },
  { id: "knock", label: "Knock" },
];

export function getCallTone() {
  return localStorage.getItem(CALL_TONE_KEY) || "classic";
}
export function setCallTone(id) {
  localStorage.setItem(CALL_TONE_KEY, id);
}
export function getMessageTone() {
  return localStorage.getItem(MESSAGE_TONE_KEY) || "ding";
}
export function setMessageTone(id) {
  localStorage.setItem(MESSAGE_TONE_KEY, id);
}

// ---- Custom (user-picked) sounds -------------------------------------------
// Stored on this device in IndexedDB (files are too big for localStorage).
// Settings are per-device: the phone and the laptop each keep their own.

export const MAX_CUSTOM_TONE_BYTES = 4 * 1024 * 1024; // 4 MB

const DB_NAME = "talkies-sounds";
const STORE = "tones";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// kind: "call" | "message". Cached object URLs so playback is instant when a
// call/message arrives.
const urlCache = new Map();

export function getCustomToneName(kind) {
  return localStorage.getItem(CUSTOM_NAME_KEY_PREFIX + kind) || "";
}

export async function saveCustomTone(kind, file) {
  if (!file || !file.type.startsWith("audio/")) throw new Error("Please choose an audio file");
  if (file.size > MAX_CUSTOM_TONE_BYTES) throw new Error("That file is too large (max 4 MB)");
  await dbRun("readwrite", (store) => store.put(file, kind));
  localStorage.setItem(CUSTOM_NAME_KEY_PREFIX + kind, file.name);
  const old = urlCache.get(kind);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(kind);
}

// Resolves to an object URL for the saved sound, or null if none is saved.
export async function loadCustomTone(kind) {
  if (urlCache.has(kind)) return urlCache.get(kind);
  try {
    const blob = await dbRun("readonly", (store) => store.get(kind));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(kind, url);
    return url;
  } catch {
    return null;
  }
}

export async function removeCustomTone(kind) {
  try {
    await dbRun("readwrite", (store) => store.delete(kind));
  } catch {
    // ignore
  }
  localStorage.removeItem(CUSTOM_NAME_KEY_PREFIX + kind);
  const old = urlCache.get(kind);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(kind);
}
