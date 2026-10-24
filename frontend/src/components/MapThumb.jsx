import { useLayoutEffect, useRef, useState } from "react";

// A small, still map made from free map tiles (OpenStreetMap data, CARTO styling): no iframe, no API key, no
// big credit text over the picture. Dark when the chat is dark. `marker`: "pin" | "avatar" | "dot" | "none".
const TILE = 256;

const worldPx = (lat, lng, z) => {
  const s = TILE * 2 ** z;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  return { x: ((lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s, s };
};

const isDarkAt = (el) => {
  try {
    const v = getComputedStyle(el).getPropertyValue("--wa-bg").trim().split(/\s+/).map(Number);
    if (v.length >= 3 && v.every(Number.isFinite)) return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2] < 128;
  } catch {
    /* default below */
  }
  return true;
};

const tileUrl = (dark, z, x, y) => {
  const sub = "abcd"[(x + y) % 4];
  return dark ? `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png` : `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
};

const MapThumb = ({ lat, lng, zoom = 16, height = 140, marker = "pin", avatar = "", name = "", className = "", children }) => {
  const ref = useRef(null);
  const [w, setW] = useState(260);
  const [dark, setDark] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      setW(el.clientWidth || 260);
      setDark(isDarkAt(el));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const la = Number(lat);
  const ln = Number(lng);
  const { x, y, s } = worldPx(la, ln, zoom);
  const ox = x - w / 2;
  const oy = y - height / 2;
  const n = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + height) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${tx}:${ty}`, src: tileUrl(dark, zoom, wx, ty), left: tx * TILE - ox, top: ty * TILE - oy });
    }
  }

  return (
    <div ref={ref} className={`relative overflow-hidden ${dark ? "bg-[#1b2733]" : "bg-[#e8e4dc]"} ${className}`} style={{ height }}>
      {tiles.map((t) => (
        <img key={t.key} src={t.src} alt="" draggable={false} decoding="async" className="absolute max-w-none select-none pointer-events-none" style={{ left: t.left, top: t.top, width: TILE, height: TILE }} />
      ))}
      {marker === "pin" && (
        <svg viewBox="0 0 24 34" className="absolute left-1/2 top-1/2 w-[26px] -translate-x-1/2 -translate-y-full drop-shadow-md pointer-events-none" aria-hidden>
          <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 34 12 34s12-13.6 12-22.3C24 5.2 18.6 0 12 0z" fill="#EA4335" />
          <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
        </svg>
      )}
      {marker === "avatar" && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <span className="block size-[46px] rounded-full overflow-hidden border-[3px] border-white shadow-lg bg-[#2a3942] flex items-center justify-center text-white text-lg">
            {avatar ? <img src={avatar} alt="" className="size-full object-cover" draggable={false} /> : (name || "?")[0]?.toUpperCase()}
          </span>
          <span className="absolute left-1/2 -bottom-2 -translate-x-1/2 size-1.5 rounded-full bg-black/70" />
        </span>
      )}
      {marker === "dot" && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[18px] rounded-full bg-[#4285F4] border-[3px] border-white shadow pointer-events-none" />
      )}
      <span className="absolute right-1 bottom-0.5 px-1 rounded bg-black/35 text-white/80 text-[8.5px] leading-[13px] pointer-events-none">© OpenStreetMap · © CARTO</span>
      {children}
    </div>
  );
};

export default MapThumb;
