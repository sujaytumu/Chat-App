// Rotate / crop a photo on the phone (canvas only - no native plugin, so it is safe in the Android APK).
// `src` can be a data URL (a photo just picked) or a normal https URL (a photo already in a post).
const blobToDataUrl = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("unreadable"));
    r.readAsDataURL(b);
  });

export const loadImage = async (src) => {
  const url = src.startsWith("data:") ? src : await blobToDataUrl(await (await fetch(src, { mode: "cors" })).blob());
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("bad image"));
    img.src = url;
  });
};

const shrink = (canvas, max, q) => {
  const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(canvas.width * k));
  c.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; // a PNG with see-through parts must not turn black as a JPEG
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  const out = c.toDataURL("image/jpeg", q);
  c.width = c.height = 0;
  if (!out.startsWith("data:image/jpeg")) throw new Error("canvas refused");
  return out;
};
// { src (<=1440px), thumb (240px), ar0 } - same shape the new-post screen keeps for each photo
const pack = (canvas) => ({ src: shrink(canvas, 1440, 0.9), thumb: shrink(canvas, 240, 0.7), ar0: canvas.width / canvas.height });

// dir: 1 = clockwise, -1 = counter-clockwise
export const rotateImage = async (src, dir = 1) => {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = h;
  c.height = w;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  const out = pack(c);
  c.width = c.height = 0;
  return out;
};

// r = { x, y, w, h } as fractions (0..1) of the whole picture
export const cropImage = async (src, r) => {
  const img = await loadImage(src);
  const sx = Math.max(0, Math.round(r.x * img.naturalWidth));
  const sy = Math.max(0, Math.round(r.y * img.naturalHeight));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(r.w * img.naturalWidth)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(r.h * img.naturalHeight)));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const out = pack(c);
  c.width = c.height = 0;
  return out;
};
