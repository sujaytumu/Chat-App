// A short fingerprint of a file: its size plus the bytes at the start, middle and end. The same video picked
// again gives the same fingerprint, whatever it is called, so duplicates can be spotted without comparing whole files.
const PART = 256 * 1024;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fileHash = async (file) => {
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

// A small picture fingerprint of the video's thumbnail (64 bits: bright or dark for each cell of an 8x8 grid). The same
// video, even saved again at another quality, gives (almost) the same value. "" when the phone can't read the video.
export const thumbHash = (file) =>
  new Promise((resolve) => {
    let done = false;
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      resolve(val);
    };
    const timer = setTimeout(() => finish(""), 4000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onerror = () => finish("");
    v.onloadedmetadata = () => {
      try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch { finish(""); }
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(v, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        const lum = [];
        for (let i = 0; i < 64; i++) lum.push(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
        const avg = lum.reduce((a, b) => a + b, 0) / 64;
        let out = "";
        for (let i = 0; i < 64; i += 4) out += ((lum[i] > avg ? 8 : 0) | (lum[i + 1] > avg ? 4 : 0) | (lum[i + 2] > avg ? 2 : 0) | (lum[i + 3] > avg ? 1 : 0)).toString(16);
        finish(out);
      } catch { finish(""); }
    };
    v.src = url;
  });

// file fingerprint + "." + thumbnail fingerprint (the second part may be missing)
export const fingerprintFile = async (file) => {
  const [base, th] = await Promise.all([fileHash(file), thumbHash(file).catch(() => "")]);
  return base ? (th ? `${base}.${th}` : base) : "";
};
