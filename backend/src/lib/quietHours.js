// Quiet hours: is `now` inside the person's daily do-not-disturb window?
// q = { on, from, to, tz } with from/to in minutes after midnight (their own time) and tz their UTC offset in minutes.
// An overnight window (22:00 -> 07:00) is from > to; from === to means no window at all.
export function inQuietHours(q, now = Date.now()) {
  if (!q || !q.on) return false;
  const { from, to } = q;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const local = (((Math.floor(now / 60000) + (Number(q.tz) || 0)) % 1440) + 1440) % 1440;
  return from < to ? local >= from && local < to : local >= from || local < to;
}

const mins = (v) => Number.isInteger(v) && v >= 0 && v < 1440;

// Checks what the app sent; returns the clean object or null when it's not valid.
export function cleanQuietHours(b) {
  if (!b || typeof b !== "object") return null;
  const tz = Number(b.tz);
  if (!mins(b.from) || !mins(b.to) || !Number.isInteger(tz) || tz < -840 || tz > 840) return null;
  return { on: b.on === true, from: b.from, to: b.to, tz };
}
