// App lock: a PIN asked when Talkies opens (and when you come back after being away for the chosen time).
// Kept on this phone only: the PIN is never sent anywhere, only a salted hash of it is stored here.
// Forgot it? Signing out removes the lock (you need your account password to sign back in).
import { create } from "zustand";

const KEY = "talkies-app-lock";
export const LOCK_DELAYS = [
  { value: 0, label: "Immediately" },
  { value: 60, label: "After 1 minute" },
  { value: 900, label: "After 15 minutes" },
  { value: 3600, label: "After 1 hour" },
];
export const PIN_MIN = 4;
export const PIN_MAX = 6;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v.salt === "string" && typeof v.hash === "string") return v;
  } catch {
    /* storage unavailable */
  }
  return null;
};
const write = (v) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
};

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
async function hashPin(pin, salt) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("no-crypto");
  const key = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120000 }, key, 256);
  return toHex(bits);
}

export const isAppLockOn = () => !!read();
export const getLockDelay = () => (Number.isFinite(read()?.delay) ? read().delay : 0);

// Starts locked when a PIN exists (a fresh launch always asks).
export const useAppLockStore = create(() => ({ locked: isAppLockOn() }));

export async function enableAppLock(pin, delay = 0) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("bad-pin");
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  write({ salt, hash: await hashPin(pin, salt), delay });
}
export function disableAppLock() {
  write(null);
  useAppLockStore.setState({ locked: false });
}
export function setLockDelay(delay) {
  const v = read();
  if (v) write({ ...v, delay });
}

// Wrong tries: 5 in a row -> 30 s wait (kept in memory, so closing the app doesn't bypass the count within a session).
let wrong = 0;
let waitUntil = 0;
export const waitSeconds = () => Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));

export async function checkPin(pin) {
  const v = read();
  if (!v) return true;
  if (waitSeconds() > 0) return false;
  let ok = false;
  try {
    ok = (await hashPin(pin, v.salt)) === v.hash;
  } catch {
    ok = false;
  }
  if (ok) {
    wrong = 0;
    useAppLockStore.setState({ locked: false });
    return true;
  }
  if (++wrong >= 5) {
    wrong = 0;
    waitUntil = Date.now() + 30000;
  }
  return false;
}

export const lockNow = () => {
  if (isAppLockOn()) useAppLockStore.setState({ locked: true });
};

// Lock again when the app has been in the background for the chosen time.
let hiddenAt = 0;
let watching = false;
export function watchAppLock() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else if (hiddenAt && isAppLockOn() && Date.now() - hiddenAt >= getLockDelay() * 1000) {
      lockNow();
    }
    if (document.visibilityState === "visible") hiddenAt = 0;
  });
}
