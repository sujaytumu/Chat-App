// Cloudinary can resize + re-encode images on the fly (f_auto = WebP/AVIF where
// supported, q_auto = smart quality). Serving a 56px avatar or a 260px chat
// bubble from the multi-megabyte original is the single biggest waste of
// bandwidth in a chat app, so thumbnails go through this.
const MARK = "/image/upload/";

export function optimizeImage(url, width) {
  if (!url || typeof url !== "string" || !url.includes("res.cloudinary.com") || !url.includes(MARK)) return url;
  if (url.includes(`${MARK}f_auto`)) return url; // already transformed
  const dpr = typeof window !== "undefined" ? Math.min(Math.ceil(window.devicePixelRatio || 1), 2) : 1;
  const t = `f_auto,q_auto${width ? `,w_${Math.round(width * dpr)},c_limit` : ""}`;
  return url.replace(MARK, `${MARK}${t}/`);
}
