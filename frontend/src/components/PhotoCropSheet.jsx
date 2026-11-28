import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, Loader2, ZoomIn, ZoomOut, RotateCcw, RotateCw } from "lucide-react";
import toast from "react-hot-toast";
import { loadImage, cropImage, rotateImage } from "../lib/photoEdit";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen crop: drag the box to move it, drag a corner to resize. Pointer events + canvas only (APK-safe).
const ASPECTS = [["free", "Free", 0], ["orig", "Original", -1], ["sq", "1:1", 1], ["port", "4:5", 0.8], ["p34", "3:4", 0.75], ["wide", "16:9", 16 / 9]];
const MIN = 48; // smallest crop side, in screen px
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const CORNERS = [["tl", "-left-[22px] -top-[22px]"], ["tr", "-right-[22px] -top-[22px]"], ["bl", "-left-[22px] -bottom-[22px]"], ["br", "-right-[22px] -bottom-[22px]"]];

const PhotoCropSheet = ({ src, onClose, onApply, initialRect }) => {
  useBackToClose(true, onClose); // phone Back closes this, instead of leaving the page behind it
  const [img, setImg] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState("free");
  const [rect, setRect] = useState({ x: 0, y: 0, w: 1, h: 1 }); // fractions of the shown picture
  const [busy, setBusy] = useState(false);
  const area = useRef(null);
  const drag = useRef(null);
  // zoom in/out, move around while zoomed (drag the empty area or pinch), and rotate - all before cropping
  const [curSrc, setCurSrc] = useState(src);
  const [basePack, setBasePack] = useState(null); // set once this sheet rotated the picture: the rotated whole picture
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pts = useRef(new Map());
  const pinch = useRef(null);
  const panFrom = useRef(null);
  const MAXZ = 4;

  useEffect(() => {
    let live = true;
    loadImage(curSrc).then((i) => live && setImg(i)).catch(() => { toast.error("Couldn't open this photo to crop"); onClose(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curSrc]);
  useEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // the picture, fitted inside the area
  const geo = useMemo(() => {
    if (!img || !box.w || !box.h) return null;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const k = Math.min(box.w / iw, box.h / ih);
    const dw = iw * k;
    const dh = ih * k;
    return { dw, dh, ox: (box.w - dw) / 2, oy: (box.h - dh) / 2, iw, ih };
  }, [img, box]);

  const arOf = (id) => {
    const a = ASPECTS.find((x) => x[0] === id)?.[2] ?? 0;
    return a === -1 && geo ? geo.iw / geo.ih : a;
  };
  const arF = (id) => (arOf(id) && geo ? (arOf(id) * geo.dh) / geo.dw : 0); // w/h in fractions

  const fit = (id) => {
    const a = arF(id);
    if (!a) return { x: 0, y: 0, w: 1, h: 1 };
    let w = 1;
    let h = 1 / a;
    if (h > 1) { h = 1; w = a; }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  };
  const pickAspect = (id) => { setAspect(id); setRect(fit(id)); };
  const ready = !!geo;
  // a photo cropped before opens on its ORIGINAL picture with the earlier crop box on it: zoom out / widen the box / Reset to get it all back
  useEffect(() => { if (ready) setRect(initialRect || fit(aspect)); /* first fit once the picture is measured */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const start = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, r: { ...rect } };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !geo) return;
    const dx = (e.clientX - d.x0) / (geo.dw * zoom);
    const dy = (e.clientY - d.y0) / (geo.dh * zoom);
    const r = d.r;
    if (d.mode === "move") {
      setRect({ ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) });
      return;
    }
    const left = d.mode.includes("l");
    const top = d.mode.includes("t");
    const sx = left ? -1 : 1;
    const sy = top ? -1 : 1;
    const ax = left ? r.x + r.w : r.x; // the corner that stays still
    const ay = top ? r.y + r.h : r.y;
    const px = clamp((left ? r.x : r.x + r.w) + dx, 0, 1);
    const py = clamp((top ? r.y : r.y + r.h) + dy, 0, 1);
    const minW = MIN / geo.dw;
    const minH = MIN / geo.dh;
    const maxW = sx > 0 ? 1 - ax : ax;
    const maxH = sy > 0 ? 1 - ay : ay;
    const a = arF(aspect);
    let w = sx > 0 ? px - ax : ax - px;
    let h = sy > 0 ? py - ay : ay - py;
    if (a) {
      w = Math.max(w, h * a, minW);
      w = Math.min(w, maxW, maxH * a);
      h = w / a;
    } else {
      w = clamp(w, Math.min(minW, maxW), maxW);
      h = clamp(h, Math.min(minH, maxH), maxH);
    }
    setRect({ x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h });
  };
  const end = () => { drag.current = null; };

  const limitPan = (p, z) => {
    if (!geo) return p;
    const mx = ((z - 1) * geo.dw) / 2 + 40;
    const my = ((z - 1) * geo.dh) / 2 + 40;
    return { x: clamp(p.x, -mx, mx), y: clamp(p.y, -my, my) };
  };
  const setZ = (z) => {
    const nz = clamp(z, 1, MAXZ);
    setZoom(nz);
    setPan((p) => (nz === 1 ? { x: 0, y: 0 } : limitPan(p, nz)));
  };
  const areaDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom };
      panFrom.current = null;
    } else {
      panFrom.current = { x: e.clientX, y: e.clientY, p: { ...pan } };
    }
  };
  const areaMove = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      setZ(pinch.current.z * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.current.d));
    } else if (panFrom.current && zoom > 1) {
      const f = panFrom.current;
      setPan(limitPan({ x: f.p.x + e.clientX - f.x, y: f.p.y + e.clientY - f.y }, zoom));
    }
  };
  const areaUp = (e) => {
    pts.current.delete(e.pointerId);
    pinch.current = null;
    panFrom.current = null;
  };
  const rotate = async (dir) => {
    if (busy || !img) return;
    setBusy(true);
    try {
      const r = await rotateImage(img.src, dir);
      setImg(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setBasePack(r);
      setCurSrc(r.src);
    } catch {
      toast.error("Couldn't rotate this photo");
    }
    setBusy(false);
  };

  const apply = async () => {
    if (busy || !img) return;
    setBusy(true);
    try {
      onApply(await cropImage(img.src, rect), rect, basePack);
    } catch {
      toast.error("Couldn't crop this photo");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2 shrink-0">
        <button onClick={onClose} disabled={busy} aria-label="Cancel" className="size-10 flex items-center justify-center rounded-full active:bg-white/10"><X size={24} /></button>
        <h3 className="flex-1 text-[18px] font-semibold">Crop</h3>
        <button onClick={() => { setAspect("free"); setRect({ x: 0, y: 0, w: 1, h: 1 }); setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={busy || !img} className="h-10 px-4 rounded-full bg-white/10 text-[14px] active:scale-95 disabled:opacity-50">Whole photo</button>
        <button onClick={apply} disabled={busy || !img} aria-label="Apply crop" className="h-10 px-5 rounded-full bg-[#21C063] text-black font-semibold text-[15px] flex items-center gap-1.5 disabled:opacity-60 active:scale-95">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Done
        </button>
      </div>
      <div className="flex-1 min-h-0 relative overflow-hidden p-6">
        <div ref={area} className="relative w-full h-full touch-none" onPointerDown={areaDown} onPointerMove={areaMove} onPointerUp={areaUp} onPointerCancel={areaUp} onWheel={(e) => setZ(zoom - e.deltaY * 0.002)}>
          {geo && (
            <div className="absolute touch-none select-none" style={{ left: geo.ox, top: geo.oy, width: geo.dw, height: geo.dh, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}>
              <img src={img.src} alt="" draggable={false} className="w-full h-full block pointer-events-none" />
              <div
                onPointerDown={start("move")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                className="absolute border-2 border-white touch-none"
                style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,.62)", borderWidth: 2 / zoom }}
              >
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/35 pointer-events-none" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-white/35 pointer-events-none" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/35 pointer-events-none" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-white/35 pointer-events-none" />
                {CORNERS.map(([id, pos]) => (
                  <span key={id} onPointerDown={start(id)} style={{ transform: `scale(${1 / zoom})` }} className={`absolute ${pos} size-11 flex items-center justify-center touch-none`}>
                    <span className="size-4 rounded-sm bg-white shadow" />
                  </span>
                ))}
              </div>
            </div>
          )}
          {!geo && <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-white/70" /></div>}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 pt-1 shrink-0">
        <button onClick={() => rotate(-1)} disabled={busy || !img} aria-label="Rotate left" className="size-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95 disabled:opacity-50"><RotateCcw size={19} /></button>
        <button onClick={() => setZ(zoom - 0.5)} aria-label="Zoom out" className="size-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"><ZoomOut size={19} /></button>
        <input type="range" min={1} max={MAXZ} step="0.05" value={zoom} onChange={(e) => setZ(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-[#21C063]" />
        <button onClick={() => setZ(zoom + 0.5)} aria-label="Zoom in" className="size-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"><ZoomIn size={19} /></button>
        <button onClick={() => rotate(1)} disabled={busy || !img} aria-label="Rotate right" className="size-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95 disabled:opacity-50"><RotateCw size={19} /></button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pt-2 pb-[calc(14px+env(safe-area-inset-bottom))] shrink-0">
        {ASPECTS.map(([id, label]) => (
          <button key={id} onClick={() => pickAspect(id)} className={`shrink-0 h-10 px-5 rounded-full text-[14px] ${aspect === id ? "bg-[#21C063] text-black font-semibold" : "bg-white/10"}`}>{label}</button>
        ))}
      </div>
    </div>
  );
};

export default PhotoCropSheet;
