// A short fingerprint of a file: its size plus the bytes at the start, middle and end. The same video picked
// again gives the same fingerprint, whatever it is called, so duplicates can be spotted without comparing whole files.
const PART = 256 * 1024;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export const fingerprintFile = async (file) => {
  try {
    const size = file.size;
    const parts = [file.slice(0, PART)];
    if (size > PART * 3) parts.push(file.slice(Math.floor(size / 2) - PART / 2, Math.floor(size / 2) + PART / 2));
    if (size > PART * 2) parts.push(file.slice(size - PART));
    const bufs = await Promise.all(parts.map((p) => p.arrayBuffer()));
    const all = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0) + 8);
    let o = 0;
    for (const b of bufs) {
      all.set(new Uint8Array(b), o);
      o += b.byteLength;
    }
    new DataView(all.buffer).setFloat64(o, size);
    if (globalThis.crypto?.subtle) return hex(await crypto.subtle.digest("SHA-256", all)).slice(0, 40);
    let h = 2166136261; // very old WebViews: a simple hash instead
    for (let i = 0; i < all.length; i += 7) h = Math.imul(h ^ all[i], 16777619) >>> 0;
    return `f${size}-${h.toString(16)}`;
  } catch {
    return "";
  }
};
