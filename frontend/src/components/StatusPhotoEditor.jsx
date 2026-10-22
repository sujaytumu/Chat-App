import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from "react";
import WallpaperCropper from "./WallpaperCropper";
import { Pencil, Undo2, Sticker, Smile, MapPin, Trash2, ArrowLeft, AlignCenter, AlignLeft, AlignRight, Image as ImageIcon } from "lucide-react";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

// ---------------------------------------------------------------------------
// Icons (Material Design Icons, Apache 2.0) so the toolbar matches WhatsApp's
// ---------------------------------------------------------------------------
const Mdi = ({ d, size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);
const D_NOTE = "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";
const D_CROP_ROTATE =
  "M7.47 21.49C4.2 19.93 1.86 16.76 1.5 13H0c.51 6.16 5.66 11 11.95 11 .23 0 .44-.02.66-.03L8.8 20.15l-1.33 1.34zM12.05 0c-.23 0-.44.02-.66.04l3.81 3.81 1.33-1.33C19.8 4.07 22.14 7.24 22.5 11H24c-.51-6.16-5.66-11-11.95-11zM16 14h2V8c0-1.11-.9-2-2-2h-6v2h6v6zm-8 2V4H6v2H4v2h2v8c0 1.1.89 2 2 2h8v2h2v-2h2v-2H8z";

const Squiggle = ({ w }) => (
  <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M6 30c4-12 8-14 10-6s6 10 10 0 6-14 12-4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Checker = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    {[0, 1, 2, 3].flatMap((r) =>
      [0, 1, 2, 3].map((c) => ((r + c) % 2 === 0 ? <rect key={`${r}${c}`} x={c * 8} y={r * 8} width="8" height="8" /> : null))
    )}
  </svg>
);

// ---------------------------------------------------------------------------
// Colour slider (white → black → rainbow), like WhatsApp's
// ---------------------------------------------------------------------------
const STOPS = [
  [0, "#ffffff"], [0.06, "#8e8e8e"], [0.11, "#000000"], [0.18, "#ff3b30"], [0.29, "#ff9500"], [0.4, "#ffd60a"],
  [0.52, "#34c759"], [0.63, "#2ee6d6"], [0.74, "#0a84ff"], [0.86, "#bf5af2"], [1, "#ff2d92"],
];
const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const colorAt = (t) => {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (t - t0) / (t1 - t0 || 1);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, "0")).join("");
    }
  }
  return STOPS[STOPS.length - 1][1];
};
const SLIDER_BG = `linear-gradient(to bottom, ${STOPS.map(([p, c]) => `${c} ${p * 100}%`).join(", ")})`;
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const ColorSlider = ({ t, color, onChange }) => {
  const el = useRef(null);
  const set = (e) => {
    const r = el.current.getBoundingClientRect();
    const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange(v, colorAt(v));
  };
  return (
    <div
      ref={el}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      className="absolute right-[18px] top-[15%] h-[28%] w-[26px] rounded-full z-[25]"
      style={{ background: SLIDER_BG, touchAction: "none", boxShadow: "0 0 0 1px rgba(255,255,255,.25)" }}
      role="slider"
      aria-label="Colour"
    >
      <span
        className="absolute left-1/2 size-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white pointer-events-none"
        style={{ top: `${t * 100}%`, background: color, boxShadow: "0 1px 6px rgba(0,0,0,.5)" }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Brushes, text styles, stickers
// ---------------------------------------------------------------------------
const BRUSHES = {
  pen: { w: 4, a: 1 },
  marker: { w: 10, a: 1 },
  bold: { w: 24, a: 0.5 },
  blur: { w: 38, a: 1 },
};

const TEXT_FONTS = [
  { css: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif", w: 400, st: "normal" },
  { css: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif", w: 400, st: "italic" },
  { css: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif", w: 700, st: "normal" },
  { css: "Georgia, 'Times New Roman', serif", w: 700, st: "normal" },
  { css: "ui-monospace, Menlo, Consolas, monospace", w: 700, st: "normal" },
  { css: "'Brush Script MT', 'Segoe Script', cursive", w: 600, st: "normal" },
  { css: "Impact, 'Arial Narrow', sans-serif", w: 400, st: "normal" },
  { css: "'Courier New', monospace", w: 400, st: "normal" },
];
const textColors = (it) => {
  if (it.bg === 1) return { fg: lum(it.color) > 0.6 ? "#111111" : "#ffffff", bg: it.color };
  if (it.bg === 2) return { fg: it.color, bg: "rgba(0,0,0,0.55)" };
  return { fg: it.color, bg: null };
};

const GREEN = "#2EE59D";
const CREAM = "#FFFBE0";
const CLOUD_DOTS = [[35, 62, 24], [58, 40, 27], [90, 40, 25], [110, 62, 23], [80, 72, 27], [50, 74, 23]];
const SHAPES = {
  arrow: { vb: [160, 120], w: 0.3, svg: `<path d="M10 110 L140 18" stroke="${GREEN}" stroke-width="12" stroke-linecap="round" fill="none"/><path d="M98 12 H148 V62" stroke="${GREEN}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` },
  circle: { vb: [120, 120], w: 0.24, svg: `<circle cx="60" cy="60" r="50" stroke="${GREEN}" stroke-width="12" fill="none"/>` },
  square: { vb: [120, 120], w: 0.24, svg: `<rect x="10" y="10" width="100" height="100" stroke="${GREEN}" stroke-width="12" fill="none"/>` },
  cloud: {
    vb: [140, 110], w: 0.3,
    svg:
      CLOUD_DOTS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 6}" fill="${GREEN}"/>`).join("") +
      CLOUD_DOTS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${CREAM}"/>`).join("") +
      `<circle cx="30" cy="98" r="9" fill="${GREEN}"/><circle cx="30" cy="98" r="5" fill="${CREAM}"/>`,
  },
  bubble: { vb: [130, 110], w: 0.3, svg: `<path d="M65 10C100 10 120 28 120 50C120 72 100 90 65 90C60 90 55 89 50 88L18 106L32 82C18 74 10 63 10 50C10 28 30 10 65 10Z" fill="${CREAM}" stroke="${GREEN}" stroke-width="8" stroke-linejoin="round"/>` },
  rbubble: { vb: [130, 120], w: 0.3, svg: `<path d="M24 8H106A14 14 0 0 1 120 22V66A14 14 0 0 1 106 80H58L26 108L34 80H24A14 14 0 0 1 10 66V22A14 14 0 0 1 24 8Z" fill="${CREAM}" stroke="${GREEN}" stroke-width="8" stroke-linejoin="round"/>` },
};
const svgUrl = (svg, vb) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb[0]} ${vb[1]}" width="${vb[0]}" height="${vb[1]}">${svg}</svg>`)}`;

const clockSvg = (hh, mm) => {
  const ha = ((hh % 12) + mm / 60) * 30 * (Math.PI / 180);
  const ma = mm * 6 * (Math.PI / 180);
  const hx = 60 + 28 * Math.sin(ha);
  const hy = 60 - 28 * Math.cos(ha);
  const mx = 60 + 40 * Math.sin(ma);
  const my = 60 - 40 * Math.cos(ma);
  return (
    `<circle cx="60" cy="60" r="57" fill="#fff" stroke="#e3e3e3" stroke-width="3"/>` +
    [["12", 60, 22], ["3", 98, 66], ["6", 60, 105], ["9", 22, 66]].map(([t, x, y]) => `<text x="${x}" y="${y}" font-size="14" font-family="sans-serif" fill="#444" text-anchor="middle">${t}</text>`).join("") +
    `<line x1="60" y1="60" x2="${hx}" y2="${hy}" stroke="#222" stroke-width="5" stroke-linecap="round"/>` +
    `<line x1="60" y1="60" x2="${mx}" y2="${my}" stroke="#e23b3b" stroke-width="3.5" stroke-linecap="round"/>` +
    `<circle cx="60" cy="60" r="4.5" fill="#e23b3b"/>`
  );
};
const timeSvg = (label) =>
  `<rect width="150" height="64" rx="18" fill="#fff"/><text x="75" y="46" text-anchor="middle" font-size="42" font-family="system-ui, sans-serif" fill="#111">${label}</text>`;

// Picture + size (as a fraction of the photo's width) for the svg / photo style stickers.
const visualOf = (it) => {
  if (it.kind === "shape") {
    const s = SHAPES[it.shape];
    return { url: svgUrl(s.svg, s.vb), w: s.w, ratio: s.vb[1] / s.vb[0] };
  }
  if (it.kind === "clock") return { url: svgUrl(clockSvg(it.hh, it.mm), [120, 120]), w: 0.24, ratio: 1 };
  if (it.kind === "time") return { url: svgUrl(timeSvg(it.label), [150, 64]), w: 0.34, ratio: 64 / 150 };
  if (it.kind === "photo") return { url: it.src, w: 0.4, ratio: it.ratio || 1 };
  return null;
};

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Mosaic version of the picture (the "blur" brush reveals this)
const pixelate = (img, w, h) => {
  const tw = 32;
  const th = Math.max(1, Math.round((tw * h) / w));
  const tiny = document.createElement("canvas");
  tiny.width = tw;
  tiny.height = th;
  tiny.getContext("2d").drawImage(img, 0, 0, tw, th);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, w, h);
  return c;
};

// Greedy word wrap for the exported picture (keeps lines where the on-screen text breaks them)
const wrapLines = (ctx, text, maxW) => {
  const out = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else if (line) {
        out.push(line);
        line = word;
      } else {
        // a single word wider than the line: break it by letters
        let chunk = "";
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxW && chunk) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
    }
    out.push(line);
  }
  return out;
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const RECENT_KEY = "status-recent-emoji";
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------
// Photo editor like WhatsApp's status editor: crop, draw (4 brushes), text, stickers.
// Everything stays editable on screen and is flattened into the picture on send.
const StatusPhotoEditor = forwardRef(function StatusPhotoEditor({ src, onClose, onMusic, hasSong, onRotated, onLocation, onModeChange, chat = false }, ref) {
  const stage = useRef(null);
  const imgEl = useRef(null);
  const trashEl = useRef(null);
  const photoInput = useRef(null);
  const [mode, setMode] = useState(null); // null | draw | text | stickers
  const [cropFile, setCropFile] = useState(null); // photo handed to the cropper
  const [sw, setSw] = useState(360); // on-screen width of the photo
  const [t, setT] = useState(0);
  const [color, setColor] = useState("#ffffff");
  const [brush, setBrush] = useState("pen");
  const [strokes, setStrokes] = useState([]);
  const [items, setItems] = useState([]);
  const [pixelSrc, setPixelSrc] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  // text editing
  const [draft, setDraft] = useState("");
  const [fontIdx, setFontIdx] = useState(0);
  const [align, setAlign] = useState(0); // 0 centre, 1 left, 2 right
  const [bgStyle, setBgStyle] = useState(0); // 0 none, 1 solid, 2 dark
  const [editId, setEditId] = useState(null);
  // stickers
  const [trayTab, setTrayTab] = useState("stickers");
  const [recent, setRecent] = useState(readRecent);

  // Zoom / pan for looking closely at the photo (pinch with two fingers, scroll wheel, double-tap to reset)
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const vp = useRef({ pts: new Map(), d0: 0, z0: 1, last: null });
  const clampView = (v) => {
    const el = stage.current;
    const z = Math.min(6, Math.max(1, v.z));
    const mx = el ? ((z - 1) * el.offsetWidth) / 2 : 0;
    const my = el ? ((z - 1) * el.offsetHeight) / 2 : 0;
    return { z, x: z === 1 ? 0 : Math.min(mx, Math.max(-mx, v.x)), y: z === 1 ? 0 : Math.min(my, Math.max(-my, v.y)) };
  };
  const vDown = (e) => {
    if (mode || e.target.closest?.("button, input, textarea, a")) return;
    const g = vp.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.z0 = view.z;
    }
    g.last = { x: e.clientX, y: e.clientY };
    const now = Date.now();
    if (g.pts.size === 1) {
      if (now - (g.tap || 0) < 280) setView((v) => (v.z > 1 ? { z: 1, x: 0, y: 0 } : clampView({ z: 2.5, x: 0, y: 0 })));
      g.tap = now;
    }
  };
  const vMove = (e) => {
    const g = vp.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pts.size >= 2) {
      const [a, b] = [...g.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setView((v) => clampView({ ...v, z: (g.z0 * d) / g.d0 }));
    } else if (view.z > 1 && g.last) {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) g.tap = 0;
      setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    g.last = { x: e.clientX, y: e.clientY };
  };
  const vUp = (e) => {
    vp.current.pts.delete(e.pointerId);
    vp.current.last = null;
  };
  const vWheel = (e) => {
    if (mode) return;
    setView((v) => clampView({ ...v, z: v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15) }));
  };

  const drawing = useRef(null);
  const ptrs = useRef(new Map());
  const gesture = useRef({ id: null, mode: "idle" });

  useEffect(() => {
    onModeChange?.(mode || (dragging ? "drag" : null));
  }, [mode, dragging, onModeChange]);

  useEffect(() => {
    const el = stage.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => setSw(el.clientWidth || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mosaic copy for the blur brush, made the first time drawing opens
  useEffect(() => {
    const im = imgEl.current;
    if (mode !== "draw" || pixelSrc || !im?.naturalWidth) return;
    const w = Math.min(im.naturalWidth, 720);
    const h = Math.round((w * im.naturalHeight) / im.naturalWidth);
    setPixelSrc(pixelate(im, w, h).toDataURL("image/jpeg", 0.7));
  }, [mode, pixelSrc]);

  const rel = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
  };

  // ---- drawing ----
  const down = (e) => {
    if (mode !== "draw") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = { brush, color, pts: [rel(e)] };
    setStrokes((s) => [...s, drawing.current]);
  };
  const move = (e) => {
    if (!drawing.current) return;
    drawing.current.pts.push(rel(e));
    setStrokes((s) => [...s.slice(0, -1), { ...drawing.current }]);
  };
  const up = () => {
    drawing.current = null;
  };

  // ---- items: drag, pinch (size + turn), tap text to edit, drop on the bin to delete ----
  const addItem = (partial) => setItems((l) => [...l, { id: Date.now() + Math.random(), x: 0.5, y: 0.5, s: 1, r: 0, ...partial }]);

  const overBin = (e) => {
    const r = trashEl.current?.getBoundingClientRect();
    if (!r) return false;
    return e.clientX > r.left - 24 && e.clientX < r.right + 24 && e.clientY > r.top - 24 && e.clientY < r.bottom + 24;
  };

  const itemDown = (e, it) => {
    if (mode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (ptrs.current.size === 1) {
      const [px, py] = rel(e);
      Object.assign(g, { id: it.id, item: it, mode: "drag", off: [it.x - px, it.y - py], moved: false, start: { x: e.clientX, y: e.clientY } });
    } else if (ptrs.current.size === 2 && g.id === it.id) {
      const [a, b] = [...ptrs.current.values()];
      Object.assign(g, { mode: "pinch", moved: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), s0: it.s || 1, r0: it.r || 0 });
    }
  };
  const itemMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.id == null) return;
    if (g.mode === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const s = Math.min(6, Math.max(0.25, (g.s0 * d) / g.d0));
      const r = g.r0 + ((ang - g.a0) * 180) / Math.PI;
      setItems((l) => l.map((i) => (i.id === g.id ? { ...i, s, r } : i)));
      return;
    }
    if (g.mode === "drag") {
      if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 6) return;
      if (!g.moved) {
        g.moved = true;
        setDragging(true);
      }
      const [x, y] = rel(e);
      setItems((l) => l.map((i) => (i.id === g.id ? { ...i, x: clamp01(x + g.off[0]), y: clamp01(y + g.off[1]) } : i)));
      setOverTrash(overBin(e));
    }
  };
  const itemUp = (e) => {
    const g = gesture.current;
    ptrs.current.delete(e.pointerId);
    if (g.id == null) return;
    if (ptrs.current.size > 0) {
      g.mode = "idle";
      return;
    }
    if (g.mode === "drag") {
      if (!g.moved) {
        if (g.item?.kind === "text") openTextEditor(g.item);
      } else if (overBin(e)) {
        setItems((l) => l.filter((i) => i.id !== g.id));
      }
    }
    g.id = null;
    g.mode = "idle";
    setDragging(false);
    setOverTrash(false);
  };

  // ---- text ----
  const openTextEditor = (it) => {
    setEditId(it ? it.id : null);
    setDraft(it ? it.value : "");
    if (it) {
      setColor(it.color);
      setFontIdx(it.font);
      setAlign(it.align);
      setBgStyle(it.bg);
    }
    setMode("text");
  };
  const finishText = () => {
    const v = draft.replace(/\s+$/, "");
    if (editId != null) {
      setItems((l) => (v.trim() ? l.map((i) => (i.id === editId ? { ...i, value: v, color, font: fontIdx, align, bg: bgStyle } : i)) : l.filter((i) => i.id !== editId)));
    } else if (v.trim()) {
      addItem({ kind: "text", value: v, color, font: fontIdx, align, bg: bgStyle });
    }
    setDraft("");
    setEditId(null);
    setMode(null);
  };

  // ---- stickers ----
  const pickEmoji = (emoji) => {
    addItem({ kind: "emoji", value: emoji });
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 15);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setMode(null);
  };
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const data = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(file);
    });
    const im = await loadImg(data);
    const k = Math.min(1, 700 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(im.naturalWidth * k);
    c.height = Math.round(im.naturalHeight * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    addItem({ kind: "photo", src: c.toDataURL("image/jpeg", 0.85), ratio: c.height / c.width });
    setMode(null);
  };
  const addTime = () => {
    const d = new Date();
    addItem({ kind: "time", label: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` });
    setMode(null);
  };
  const addClock = () => {
    const d = new Date();
    addItem({ kind: "clock", hh: d.getHours(), mm: d.getMinutes() });
    setMode(null);
  };
  const addShape = (shape) => {
    addItem({ kind: "shape", shape });
    setMode(null);
  };

  const clearAll = () => {
    setStrokes([]);
    setItems([]);
    setPixelSrc(null);
  };

  // Crop: hand the current photo to the cropper (drag the frame / corners / rotate), then use the result.
  const openCrop = async () => {
    try {
      setCropFile(await (await fetch(src)).blob());
    } catch {
      /* photo couldn't be read: leave the editor as it is */
    }
  };
  const applyCrop = (dataUrl) => {
    setCropFile(null);
    setView({ z: 1, x: 0, y: 0 });
    clearAll(); // drawings / stickers were placed on the old framing
    onRotated?.(dataUrl);
  };

  useImperativeHandle(ref, () => ({
    hasEdits: () => strokes.length > 0 || items.length > 0,
    // Flatten photo + drawing + text + stickers into one JPEG (null if untouched).
    async exportImage() {
      if (!strokes.length && !items.length) return null;
      const img = imgEl.current;
      const scale = Math.min(1, 1080 / img.naturalWidth);
      const cw = Math.round(img.naturalWidth * scale);
      const ch = Math.round(img.naturalHeight * scale);
      const k = cw / sw; // on-screen px -> picture px
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      let pix = null;
      for (const s of strokes) {
        if (s.pts.length < 1) continue;
        const b = BRUSHES[s.brush] || BRUSHES.pen;
        const trace = (g) => {
          g.beginPath();
          s.pts.forEach(([x, y], i) => (i ? g.lineTo(x * cw, y * ch) : g.moveTo(x * cw, y * ch)));
          if (s.pts.length === 1) g.lineTo(s.pts[0][0] * cw + 0.1, s.pts[0][1] * ch);
        };
        if (s.brush === "blur") {
          pix = pix || pixelate(img, cw, ch);
          const m = document.createElement("canvas");
          m.width = cw;
          m.height = ch;
          const mg = m.getContext("2d");
          mg.lineCap = "round";
          mg.lineJoin = "round";
          mg.strokeStyle = "#fff";
          mg.lineWidth = b.w * k;
          trace(mg);
          mg.stroke();
          mg.globalCompositeOperation = "source-in";
          mg.drawImage(pix, 0, 0);
          ctx.drawImage(m, 0, 0);
        } else {
          ctx.globalAlpha = b.a;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = b.w * k;
          trace(ctx);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      for (const it of items) {
        ctx.save();
        ctx.translate(it.x * cw, it.y * ch);
        ctx.rotate(((it.r || 0) * Math.PI) / 180);
        const s = it.s || 1;
        if (it.kind === "emoji") {
          ctx.font = `${cw * 0.16 * s}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(it.value, 0, 0);
        } else if (it.kind === "text") {
          const f = TEXT_FONTS[it.font] || TEXT_FONTS[0];
          const fs = cw * 0.075 * s;
          const { fg, bg } = textColors(it);
          ctx.font = `${f.st} ${f.w} ${fs}px ${f.css}`;
          const padX = fs * 0.5;
          const padY = fs * 0.25;
          const lh = fs * 1.2;
          const lines = wrapLines(ctx, it.value, cw * 0.9 - padX * 2);
          const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
          const bw = maxW + padX * 2;
          const bh = lh * lines.length + padY * 2;
          if (bg) {
            ctx.fillStyle = bg;
            roundRect(ctx, -bw / 2, -bh / 2, bw, bh, fs * 0.35);
            ctx.fill();
          } else {
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = fs * 0.12;
          }
          ctx.fillStyle = fg;
          ctx.textBaseline = "middle";
          ctx.textAlign = it.align === 1 ? "left" : it.align === 2 ? "right" : "center";
          const ax = it.align === 1 ? -maxW / 2 : it.align === 2 ? maxW / 2 : 0;
          lines.forEach((l, i) => ctx.fillText(l, ax, -bh / 2 + padY + lh * (i + 0.5)));
        } else {
          const v = visualOf(it);
          if (v) {
            const im = await loadImg(v.url);
            const w = cw * v.w * s;
            ctx.drawImage(im, -w / 2, -(w * v.ratio) / 2, w, w * v.ratio);
          }
        }
        ctx.restore();
      }
      return c.toDataURL("image/jpeg", 0.88);
    },
  }));

  const tb = "size-12 rounded-full bg-[#101418] text-white flex items-center justify-center active:bg-[#1c242b]";
  const pill = "h-10 px-5 rounded-full bg-[#101418] text-white text-[16px] flex items-center active:bg-[#1c242b]";
  const bigImage = mode === "draw" || mode === "text";
  const now = new Date();
  const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const renderItem = (it) => {
    const s = it.s || 1;
    const common = {
      left: `${it.x * 100}%`,
      top: `${it.y * 100}%`,
      touchAction: "none",
      transform: `translate(-50%, -50%) rotate(${it.r || 0}deg)`,
    };
    let inner;
    if (it.kind === "emoji") {
      inner = <span style={{ fontSize: sw * 0.16 * s, lineHeight: 1.1 }}>{it.value}</span>;
    } else if (it.kind === "text") {
      const f = TEXT_FONTS[it.font] || TEXT_FONTS[0];
      const { fg, bg } = textColors(it);
      const fs = sw * 0.075 * s;
      inner = (
        <div
          style={{
            fontFamily: f.css, fontWeight: f.w, fontStyle: f.st, fontSize: fs, lineHeight: 1.2, color: fg, background: bg || "transparent",
            padding: `${fs * 0.25}px ${fs * 0.5}px`, borderRadius: fs * 0.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere", boxSizing: "border-box",
            maxWidth: sw * 0.9, textAlign: it.align === 1 ? "left" : it.align === 2 ? "right" : "center",
            textShadow: bg ? "none" : `0 0 ${fs * 0.12}px rgba(0,0,0,.5)`, width: "max-content",
          }}
        >
          {it.value}
        </div>
      );
    } else {
      const v = visualOf(it);
      inner = <img src={v.url} alt="" draggable={false} style={{ width: sw * v.w * s, height: "auto", display: "block" }} />;
    }
    return (
      <div
        key={it.id}
        onPointerDown={(e) => itemDown(e, it)}
        onPointerMove={itemMove}
        onPointerUp={itemUp}
        onPointerCancel={itemUp}
        className={`absolute ${mode ? "pointer-events-none" : "cursor-grab"}`}
        style={common}
      >
        {inner}
      </div>
    );
  };

  const draftFont = TEXT_FONTS[fontIdx];
  const draftColors = textColors({ color, bg: bgStyle });
  const fsDraft = sw * 0.075;
  const draftAlign = align === 1 ? "left" : align === 2 ? "right" : "center";

  return (
    <div
      className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden select-none"
      style={{ touchAction: mode ? undefined : "none" }}
      onPointerDown={vDown}
      onPointerMove={vMove}
      onPointerUp={vUp}
      onPointerCancel={vUp}
      onWheel={vWheel}
    >
      <div ref={stage} className="relative inline-flex max-w-full max-h-full" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transition: vp.current.pts.size ? "none" : "transform .18s ease-out" }}>
        <img
          ref={imgEl}
          src={src}
          alt="Status preview"
          draggable={false}
          className="block max-w-full object-contain"
          style={{ maxHeight: bigImage ? "calc(100dvh - 200px)" : chat ? "calc(100dvh - 250px)" : "calc(100dvh - 440px)" }}
          onLoad={() => setSw(stage.current?.clientWidth || 360)}
        />

        <svg
          className={`absolute inset-0 w-full h-full ${mode === "draw" ? "cursor-crosshair" : "pointer-events-none"}`}
          style={{ touchAction: mode === "draw" ? "none" : undefined }}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <defs>
            {strokes.map((s, i) =>
              s.brush === "blur" ? (
                <mask key={i} id={`bm${i}`}>
                  <polyline points={s.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={BRUSHES.blur.w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </mask>
              ) : null
            )}
          </defs>
          {strokes.map((s, i) =>
            s.brush === "blur" ? (
              pixelSrc && <image key={i} href={pixelSrc} x="0" y="0" width="1" height="1" preserveAspectRatio="none" mask={`url(#bm${i})`} style={{ imageRendering: "pixelated" }} />
            ) : (
              <polyline
                key={i}
                points={s.pts.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={s.color}
                strokeOpacity={(BRUSHES[s.brush] || BRUSHES.pen).a}
                strokeWidth={(BRUSHES[s.brush] || BRUSHES.pen).w}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
        </svg>

        {items.map(renderItem)}
      </div>

      {/* Top toolbar */}
      {!mode && (
        <div className="absolute top-0 inset-x-0 flex items-center gap-1.5 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
          <button onClick={onClose} aria-label="Close" className={tb}>
            <span className="text-[22px] leading-none">✕</span>
          </button>
          <div className="flex-1" />
          {onMusic && (
            <button onClick={onMusic} aria-label="Add music" className={`${tb} ${hasSong ? "!bg-[#21C063] !text-black" : ""}`}>
              <Mdi d={D_NOTE} size={22} />
            </button>
          )}
          <button onClick={openCrop} aria-label="Crop and rotate" className={tb}>
            <Mdi d={D_CROP_ROTATE} size={24} />
          </button>
          <button onClick={() => setMode("stickers")} aria-label="Stickers" className={tb}>
            <Sticker size={22} />
          </button>
          <button onClick={() => openTextEditor(null)} aria-label="Add text" className={`${tb} text-[20px] font-medium`}>
            Aa
          </button>
          <button onClick={() => setMode("draw")} aria-label="Draw" className={tb}>
            <Pencil size={21} />
          </button>
        </div>
      )}

      {/* Delete bin while dragging a sticker or text */}
      {dragging && (
        <div
          ref={trashEl}
          className={`absolute bottom-[calc(28px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 size-14 rounded-full flex items-center justify-center text-white transition-transform ${overTrash ? "bg-[#e5484d] scale-125" : "bg-[#101418]"}`}
        >
          <Trash2 size={24} />
        </div>
      )}

      {/* Draw: Done + undo + pencil, colour slider, 4 brushes */}
      {mode === "draw" && (
        <>
          <div className="absolute top-0 inset-x-0 flex items-center gap-2 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3 z-20">
            <button onClick={() => setMode(null)} className={pill}>
              Done
            </button>
            <div className="flex-1" />
            {strokes.length > 0 && (
              <button onClick={() => setStrokes((s) => s.slice(0, -1))} aria-label="Undo" className={tb}>
                <Undo2 size={22} />
              </button>
            )}
            <span className="size-12 rounded-full bg-[#2EE59D] text-black flex items-center justify-center">
              <Pencil size={22} />
            </span>
          </div>
          <ColorSlider
            t={t}
            color={color}
            onChange={(v, c) => {
              setT(v);
              setColor(c);
            }}
          />
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-around px-4 pt-3 pb-[calc(22px+env(safe-area-inset-bottom))] bg-black z-20">
            {[
              ["pen", <Squiggle key="p" w={2.4} />],
              ["marker", <Squiggle key="m" w={4.5} />],
              ["bold", <Squiggle key="b" w={8} />],
              ["blur", <Checker key="c" />],
            ].map(([id, icon]) => (
              <button key={id} onClick={() => setBrush(id)} aria-label={id} className={`size-[60px] rounded-full flex items-center justify-center text-white ${brush === id ? "bg-[#3a3f43]" : ""}`}>
                {icon}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Text: Done, alignment, background style, colour slider, fonts */}
      {mode === "text" && (
        <div className="absolute inset-0 z-20 bg-black/70 flex flex-col">
          <div className="flex items-center gap-2 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
            <button onClick={finishText} className={pill}>
              Done
            </button>
            <div className="flex-1" />
            <button onClick={() => setAlign((a) => (a + 1) % 3)} aria-label="Alignment" className={tb}>
              {align === 0 ? <AlignCenter size={22} /> : align === 1 ? <AlignLeft size={22} /> : <AlignRight size={22} />}
            </button>
            <button onClick={() => setBgStyle((b) => (b + 1) % 3)} aria-label="Text background" className={tb}>
              <span
                className="size-6 rounded-md grid place-items-center text-[15px] font-bold"
                style={bgStyle === 0 ? { border: "2px solid #fff" } : bgStyle === 1 ? { background: "#fff", color: "#000" } : { background: "rgba(255,255,255,.35)" }}
              >
                A
              </span>
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-8">
            <div
              className="inline-grid max-w-full"
              style={{ background: draftColors.bg || "transparent", borderRadius: fsDraft * 0.35, padding: `${fsDraft * 0.25}px ${fsDraft * 0.5}px`, minWidth: fsDraft * 4 }}
            >
              <div
                aria-hidden="true"
                className="invisible"
                style={{ gridArea: "1 / 1 / 2 / 2", fontFamily: draftFont.css, fontWeight: draftFont.w, fontStyle: draftFont.st, fontSize: fsDraft, lineHeight: 1.2, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: draftAlign }}
              >
                {draft + " "}
              </div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={200}
                placeholder="Add text"
                rows={1}
                className="bg-transparent outline-none resize-none overflow-hidden placeholder:text-white/50 w-full select-text"
                style={{ gridArea: "1 / 1 / 2 / 2", fontFamily: draftFont.css, fontWeight: draftFont.w, fontStyle: draftFont.st, fontSize: fsDraft, lineHeight: 1.2, color: draftColors.fg, textAlign: draftAlign, overflowWrap: "anywhere" }}
              />
            </div>
          </div>
          <ColorSlider
            t={t}
            color={color}
            onChange={(v, c) => {
              setT(v);
              setColor(c);
            }}
          />
          <div className="shrink-0 flex gap-2.5 overflow-x-auto no-scrollbar px-2.5 pb-3">
            {TEXT_FONTS.map((f, i) => (
              <button
                key={i}
                onClick={() => setFontIdx(i)}
                aria-label={`Font ${i + 1}`}
                className={`size-[50px] shrink-0 rounded-full flex items-center justify-center text-[20px] ${fontIdx === i ? "bg-white text-black" : "bg-[#2a2f33] text-white"}`}
                style={{ fontFamily: f.css, fontWeight: f.w, fontStyle: f.st }}
              >
                Aa
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticker tray */}
      {mode === "stickers" && (
        <>
          <div className="absolute top-0 inset-x-0 flex items-center gap-2 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3 z-10">
            <button onClick={() => setMode(null)} aria-label="Back" className={tb}>
              <ArrowLeft size={24} />
            </button>
            <div className="flex-1" />
            <span className="size-12 rounded-full bg-[#2EE59D] text-black flex items-center justify-center">
              <Sticker size={22} />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-[18%] z-30 bg-[#0A0E11] rounded-t-2xl flex flex-col overflow-hidden">
            <div className="flex justify-center pt-3 shrink-0">
              <span className="w-10 h-1 rounded-full bg-[#4A5258]" />
            </div>
            <div className="shrink-0 flex justify-center py-4">
              <div className="flex w-[250px] h-[52px] rounded-full border border-[#3a3f43] overflow-hidden">
                {[
                  ["emoji", <Smile key="e" size={26} />],
                  ["stickers", <Sticker key="s" size={26} />],
                ].map(([id, icon]) => (
                  <button key={id} onClick={() => setTrayTab(id)} aria-label={id} className={`flex-1 flex items-center justify-center ${trayTab === id ? "bg-[#1c2227] text-white" : "text-[#8E9AA2]"}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {trayTab === "emoji" ? (
              <div className="flex-1 min-h-0 pb-[env(safe-area-inset-bottom)]">
                <Suspense fallback={<p className="text-center text-[#8E9AA2] pt-10 text-[14px]">Loading…</p>}>
                  <EmojiPicker
                    theme="dark"
                    width="100%"
                    height="100%"
                    onEmojiClick={(d) => pickEmoji(d.emoji)}
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                    style={{ "--epr-bg-color": "#0A0E11", "--epr-category-label-bg-color": "#0A0E11", border: "none", borderRadius: 0 }}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button onClick={addTime} className="h-[46px] px-5 rounded-xl bg-white text-[#111] text-[24px] font-light">
                    {nowLabel}
                  </button>
                  <button onClick={addClock} aria-label="Clock" className="size-[46px] rounded-full overflow-hidden bg-white">
                    <img src={svgUrl(clockSvg(now.getHours(), now.getMinutes()), [120, 120])} alt="" className="size-full" />
                  </button>
                </div>
                <div className="flex flex-wrap justify-center gap-2.5 mt-3">
                  {onLocation && <button
                    onClick={() => {
                      setMode(null);
                      onLocation?.();
                    }}
                    className="h-[46px] px-4 rounded-xl bg-white text-[#111] text-[18px] flex items-center gap-2"
                  >
                    <MapPin size={22} className="text-[#1FA855]" /> Location
                  </button>}
                  <button onClick={() => photoInput.current?.click()} className="h-[46px] px-4 rounded-xl bg-white text-[#111] text-[18px] flex items-center gap-2">
                    <ImageIcon size={22} className="text-[#1FA855]" /> Photo
                  </button>
                  {onMusic && <button
                    onClick={() => {
                      setMode(null);
                      onMusic?.();
                    }}
                    className="h-[46px] px-4 rounded-xl bg-white text-[#111] text-[18px] flex items-center gap-2"
                  >
                    <Mdi d={D_NOTE} size={22} className="text-[#1FA855]" /> Music
                  </button>}
                </div>
                <p className="text-[#8E9AA2] text-[16px] mt-6 mb-3 px-1">Shapes</p>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(SHAPES).map(([id, s]) => (
                    <button key={id} onClick={() => addShape(id)} aria-label={id} className="h-[84px] flex items-center justify-center active:opacity-70">
                      <img src={svgUrl(s.svg, s.vb)} alt="" className="max-h-[78px] max-w-full" draggable={false} />
                    </button>
                  ))}
                </div>
                {recent.length > 0 && (
                  <>
                    <p className="text-[#8E9AA2] text-[16px] mt-6 mb-3 px-1">Recent</p>
                    <div className="grid grid-cols-5 gap-2">
                      {recent.map((em) => (
                        <button key={em} onClick={() => pickEmoji(em)} className="text-[34px] leading-none py-2 active:scale-90">
                          {em}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        </>
      )}

      {cropFile && (
        <WallpaperCropper
          file={cropFile}
          title="Crop photo"
          lockLabel="Fit screen"
          initialLocked={false}
          maxSize={1600}
          zIndex={170}
          variant="whatsapp"
          hint="Drag the frame to move it, drag a corner to resize. Only what's inside is kept."
          onCancel={() => setCropFile(null)}
          onDone={applyCrop}
        />
      )}
    </div>
  );
});

export default StatusPhotoEditor;
