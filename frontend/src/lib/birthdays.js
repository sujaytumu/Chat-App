// Birthday helpers. A birthday is { month: 1-12, day: 1-31, year? } — the year is only ever known for yourself.
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Whole days from today until the next birthday: 0 = today. Feb 29 falls on 1 March in years that have no 29th.
export function daysUntilBirthday(b, now = new Date()) {
  if (!b?.month || !b?.day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), b.month - 1, b.day);
  if (next < today) next = new Date(today.getFullYear() + 1, b.month - 1, b.day);
  return Math.round((next - today) / 86400000);
}

export const birthdayWhen = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// "3d 4h", "5h 20m", "12 min" — time left until a moment, or "" once it has passed.
export function timeLeft(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (!(ms > 0)) return "";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)} min`;
}
