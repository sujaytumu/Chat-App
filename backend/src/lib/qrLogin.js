import crypto from "crypto";

// "Log in with QR code" (WhatsApp-Web style). A browser asks for a code and shows it as a QR; the
// phone — already signed in — scans it and approves; the browser then signs in. Kept in memory
// (codes live two minutes), so nothing stale ever sits in the database.
//
//   code  = what the QR contains; anyone who can see the screen can read it
//   poll  = a secret only the browser that asked for the code knows, needed to collect the login
//           (so a photo of the QR can't be used to steal the session)
const TTL_MS = 2 * 60 * 1000;
const MAX_OPEN = 500;
const entries = new Map(); // code -> { poll, device, createdAt, status: "waiting"|"approved", userId }
const perIp = new Map(); // ip -> [timestamps]

const sweep = () => {
  const now = Date.now();
  for (const [code, e] of entries) if (now - e.createdAt > TTL_MS) entries.delete(code);
  for (const [ip, list] of perIp) {
    const fresh = list.filter((t) => now - t < 10 * 60 * 1000);
    if (fresh.length) perIp.set(ip, fresh);
    else perIp.delete(ip);
  }
};
setInterval(sweep, 60 * 1000).unref?.();

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function createQr(ip, device) {
  sweep();
  const list = perIp.get(ip) || [];
  if (list.length >= 30 || entries.size >= MAX_OPEN) return null; // too many codes — slow down
  perIp.set(ip, [...list, Date.now()]);
  const code = crypto.randomBytes(18).toString("base64url");
  const poll = crypto.randomBytes(18).toString("base64url");
  entries.set(code, { poll, device, createdAt: Date.now(), status: "waiting", userId: null });
  return { code, poll, expiresIn: Math.floor(TTL_MS / 1000) };
}

const live = (code) => {
  const e = entries.get(String(code));
  if (!e) return null;
  if (Date.now() - e.createdAt > TTL_MS) {
    entries.delete(String(code));
    return null;
  }
  return e;
};

export const qrInfo = (code) => {
  const e = live(code);
  return e ? { device: e.device, createdAt: e.createdAt, status: e.status } : null;
};

export function approveQr(code, userId) {
  const e = live(code);
  if (!e || e.status !== "waiting") return false;
  e.status = "approved";
  e.userId = String(userId);
  return true;
}

// Browser side: "waiting", or the approved user's id (the code is then used up).
export function collectQr(code, poll) {
  const e = live(code);
  if (!e || !same(e.poll, poll)) return { state: "expired" };
  if (e.status !== "approved") return { state: "waiting" };
  entries.delete(String(code));
  return { state: "approved", userId: e.userId };
}
