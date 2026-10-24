import crypto from "crypto";

// Time-based one-time passwords (RFC 6238), compatible with Google Authenticator,
// Microsoft Authenticator, Authy, 1Password, etc. No extra dependency needed.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

const STEP_SECONDS = 30;
const codeFor = (key, counter) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
};

// Returns the matching time-step (a number) or null. Allows ±1 step of clock
// drift; a step must be newer than `afterStep` so a code can't be used twice.
export function verifyTotp(secret, token, afterStep = 0) {
  const clean = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    const step = now + drift;
    if (step <= afterStep) continue;
    const expected = Buffer.from(codeFor(key, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

export const otpauthUrl = (secret, account, issuer = "Talkies") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// Backup codes: 10 characters from the base32 alphabet, shown as XXXXX-XXXXX.
export const newBackupCodes = (n = 8) =>
  Array.from({ length: n }, () => {
    const raw = base32Encode(crypto.randomBytes(8)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
export const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code).replace(/[\s-]/g, "").toUpperCase()).digest("hex");
