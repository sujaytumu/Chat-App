// Repeating schedules ("every day / week / month / year at 12:00 AM") for scheduled messages and scheduled calls.
//
// The time of day is kept in the person's OWN timezone (so "12:00 AM" stays 12:00 AM through daylight saving), and every
// repeat is worked out from the very first date - not from the previous one - so "the 31st of every month" falls on the
// last day of shorter months and comes back to the 31st afterwards, and Feb 29 yearly lands on Feb 28 in other years.
export const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"];
export const MAX_SCHEDULE_MS = 366 * 24 * 3600 * 1000; // nothing is scheduled, or repeats, beyond one year from now

export const cleanRepeat = (r) => (REPEATS.includes(r) ? r : "none");
export const cleanTz = (tz) => {
  try {
    if (typeof tz !== "string" || !tz) return "UTC";
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};

const wall = (ms, tz) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
};
const offsetAt = (ms, tz) => {
  const w = wall(ms, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
};
const fromWall = (y, mo, d, h, mi, tz) => {
  const target = Date.UTC(y, mo, d, h, mi, 0);
  let t = target;
  for (let i = 0; i < 3; i++) t = target - offsetAt(t, tz);
  return t;
};

// The n-th time (0 = the first) of a schedule that starts at `firstMs`.
export function nthOccurrence(firstMs, n, repeat, tz = "UTC") {
  if (!n || !repeat || repeat === "none") return new Date(firstMs);
  const w = wall(firstMs, tz);
  let y = w.year;
  let mo = w.month - 1;
  let d = w.day;
  if (repeat === "daily" || repeat === "weekly") {
    const base = new Date(Date.UTC(y, mo, d + (repeat === "daily" ? 1 : 7) * n));
    y = base.getUTCFullYear();
    mo = base.getUTCMonth();
    d = base.getUTCDate();
  } else {
    const total = mo + (repeat === "yearly" ? 12 * n : n);
    y += Math.floor(total / 12);
    mo = total % 12;
    d = Math.min(d, new Date(Date.UTC(y, mo + 1, 0)).getUTCDate());
  }
  return new Date(fromWall(y, mo, d, w.hour, w.minute, tz));
}

// The first repeat that is still in the future (skips any that were missed while the server was off), or null when
// the schedule has run out (past `until`).
export function nextAfterNow(firstMs, doneCount, repeat, tz, until) {
  let n = doneCount;
  let next;
  const now = Date.now();
  do {
    n += 1;
    next = nthOccurrence(firstMs, n, repeat, tz);
  } while (next.getTime() <= now && n < 4000);
  if (until && next.getTime() > new Date(until).getTime()) return null;
  return { next, n };
}
