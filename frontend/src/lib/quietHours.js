// Quiet hours (do not disturb): a daily window with no message sounds or vibration.
// The server keeps the master copy (so push notifications are also held back while the app is closed);
// this file mirrors it on the phone so the app itself goes quiet too. Times are minutes after midnight, local.
import { axiosInstance } from "./axios";

const KEY = "talkies-quiet-hours";
export const DEFAULT_QUIET = { on: false, from: 22 * 60, to: 7 * 60 };

export function getQuietHours() {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) || "null");
    if (q && Number.isInteger(q.from) && Number.isInteger(q.to)) return { on: q.on === true, from: q.from, to: q.to };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_QUIET };
}

function remember(q) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: q.on === true, from: q.from, to: q.to }));
  } catch {
    /* storage unavailable */
  }
}

// Right now inside the window? (an overnight window like 22:00 -> 07:00 has from > to)
export function inQuietHours(now = new Date()) {
  const { on, from, to } = getQuietHours();
  if (!on || from === to) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return from < to ? m >= from && m < to : m >= from || m < to;
}

export const minutesToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMinutes = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
// "10:00 PM" for display
export const prettyTime = (m) => {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Save: the phone is updated at once; the server copy follows (it also needs the phone's UTC offset).
export async function saveQuietHours(q) {
  remember(q);
  const { data } = await axiosInstance.put("/auth/quiet-hours", { ...q, tz: -new Date().getTimezoneOffset() });
  return data;
}

// Pull the server copy (set on another phone, or before this one was signed in). Never throws.
export async function syncQuietHours() {
  try {
    const { data } = await axiosInstance.get("/auth/quiet-hours");
    if (data && Number.isInteger(data.from) && Number.isInteger(data.to)) {
      remember(data);
      return getQuietHours();
    }
  } catch {
    /* offline: keep what the phone has */
  }
  return null;
}

// The server needs the phone's current UTC offset (it changes with daylight saving / travel): refresh it quietly.
export function refreshQuietHoursZone() {
  const q = getQuietHours();
  if (!q.on) return;
  axiosInstance.put("/auth/quiet-hours", { ...q, tz: -new Date().getTimezoneOffset() }).catch(() => {});
}
