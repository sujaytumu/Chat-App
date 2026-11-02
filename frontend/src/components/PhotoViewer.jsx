import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { optimizeImage } from "../lib/cdn";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen photo viewer for posts:
//  - pinch with two fingers to zoom in / out (1x - 5x), drag to move around when zoomed
//  - double-tap zooms in on that spot, double-tap again zooms out (mouse wheel and double-click work too)
//  - not zoomed: swipe sideways for the next / previous photo, drag down to close
const MIN = 1;
const MAX = 5;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const PhotoViewer = ({ images, index = 0, onClose }) => {
  useBackToClose(true, onClose);
  const [i, setI] = useState(Math.min(Math.max(0, index), images.length - 1));
  const [t, setT] = useState({ s: 1, x: 0, y: 0, anim: false }); // scale + translate of the photo (from the centre of the screen)
  const [drag, setDrag] = useState({ x: 0, y: 0 }); // finger-following offset while not zoomed
  const stage = useRef(null);
  const pointers = useRef(new Map()); // id -> { x, y }
  const g = useRef(null); // the gesture in progress
  const lastTap = useRef({ at: 0, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  const size = () => {
    const r = stage.current?.getBoundingClientRect();
    return { w: r?.width || window.innerWidth, h: r?.height || window.innerHeight, l: r?.left || 0, tp: r?.top || 0 };
  };
  // keep the photo from being dragged out of view
  const limit = useCallback((s, x, y) => {
    const { w, h } = size();
    const mx = (w * (s - 1)) / 2;
    const my = (h * (s - 1)) / 2;
    return { x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }, []);
  const reset = () => setT({ s: 1, x: 0, y: 0, anim: true });
  const go = (d) => {
    const n = i + d;
    if (n < 0 || n >= images.length) return;
    setI(n);
    setT({ s: 1, x: 0, y: 0, anim: false });
    setDrag({ x: 0, y: 0 });
  };

  const zoomAt = (px, py, ns, anim = true) => {
    const { w, h, l, tp } = size();
    const cx = l + w / 2;
    const cy = tp + h / 2;
    const cur = tRef.current;
    const s = clamp(ns, MIN, MAX);
    // keep the point under the finger where it is
    const ux = (px - cx - cur.x) / cur.s;
    const uy = (py - cy - cur.y) / cur.s;
    const lim = limit(s, px - cx - s * ux, py - cy - s * uy);
    setT({ s, ...lim, anim });
  };

  const onDown = (e) => {
    stage.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const cur = tRef.current;
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      g.current = { type: "pinch", d0: d, s0: cur.s, x0: cur.x, y0: cur.y, m0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } };
      setDrag({ x: 0, y: 0 });
    } else if (pts.length === 1) {
      g.current = { type: cur.s > 1.02 ? "pan" : "swipe", p0: { x: e.clientX, y: e.clientY }, x0: cur.x, y0: cur.y, moved: false, at: Date.now() };
    }
    setT((c) => ({ ...c, anim: false }));
  };

  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const st = g.current;
    if (!st) return;
    if (st.type === "pinch" && pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const { w, h, l, tp } = size();
      const s = clamp(st.s0 * (d / st.d0), MIN * 0.8, MAX * 1.15); // a little give past the ends, it settles back on release
      const ux = (st.m0.x - (l + w / 2) - st.x0) / st.s0;
      const uy = (st.m0.y - (tp + h / 2) - st.y0) / st.s0;
      setT({ s, x: m.x - (l + w / 2) - s * ux, y: m.y - (tp + h / 2) - s * uy, anim: false });
    } else if (st.type === "pan" && pts.length === 1) {
      const dx = e.clientX - st.p0.x;
      const dy = e.clientY - st.p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
      const cur = tRef.current;
      setT({ ...cur, ...limit(cur.s, st.x0 + dx, st.y0 + dy), anim: false });
    } else if (st.type === "swipe" && pts.length === 1) {
      const dx = e.clientX - st.p0.x;
      const dy = e.clientY - st.p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) st.moved = true;
      if (!st.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (st.axis === "x") setDrag({ x: dx, y: 0 });
      else if (st.axis === "y") setDrag({ x: 0, y: Math.max(0, dy) });
    }
  };

  const onUp = (e) => {
    const st = g.current;
    pointers.current.delete(e.pointerId);
    if (!st) return;
    if (st.type === "pinch") {
      if (pointers.current.size < 2) {
        g.current = null;
        const cur = tRef.current;
        const s = clamp(cur.s, MIN, MAX);
        if (s <= 1.04) reset();
        else setT({ s, ...limit(s, cur.x, cur.y), anim: true });
      }
      return;
    }
    if (pointers.current.size > 0) return;
    g.current = null;
    if (st.type === "swipe") {
      const dx = e.clientX - st.p0.x;
      const dy = e.clientY - st.p0.y;
      if (st.axis === "x" && Math.abs(dx) > 70) {
        setDrag({ x: 0, y: 0 });
        go(dx < 0 ? 1 : -1);
        return;
      }
      if (st.axis === "y" && dy > 110) return onClose();
      setDrag({ x: 0, y: 0 });
    }
    // a tap (not a drag): two quick taps = zoom in / out at that spot
    if (!st.moved && e.pointerType !== "mouse" && Date.now() - st.at < 300) {
      const now = Date.now();
      const lt = lastTap.current;
      if (now - lt.at < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40) {
        lastTap.current = { at: 0, x: 0, y: 0 };
        if (tRef.current.s > 1.05) reset();
        else zoomAt(e.clientX, e.clientY, 2.6);
      } else lastTap.current = { at: now, x: e.clientX, y: e.clientY };
    }
  };

  // mouse wheel zoom (computers) - the listener must not be passive so the page doesn't scroll
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, tRef.current.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), false);
      if (tRef.current.s < 1.04) setT({ s: 1, x: 0, y: 0, anim: true });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") { const { w, h, l, tp } = size(); zoomAt(l + w / 2, tp + h / 2, tRef.current.s * 1.4); }
      else if (e.key === "-") { const { w, h, l, tp } = size(); zoomAt(l + w / 2, tp + h / 2, tRef.current.s / 1.4); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // warm up the neighbours so swiping is instant
  useEffect(() => {
    [i - 1, i + 1].forEach((k) => {
      if (images[k]) { const im = new Image(); im.src = optimizeImage(images[k], 1600); }
    });
  }, [i, images]);

  const fade = Math.max(0.35, 1 - drag.y / 420);
  return (
    <div className="fixed inset-0 z-[100] text-white select-none" style={{ background: `rgba(0,0,0,${0.96 * fade})` }}>
      <div
        ref={stage}
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ touchAction: "none", cursor: t.s > 1 ? "grab" : "default" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => { if (e.pointerType === "mouse") (t.s > 1.05 ? reset() : zoomAt(e.clientX, e.clientY, 2.6)); }}
      >
        <img
          key={i}
          src={optimizeImage(images[i], 1600)}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain will-change-transform"
          style={{
            transform: `translate3d(${t.x + drag.x}px, ${t.y + drag.y}px, 0) scale(${t.s})`,
            transition: t.anim || (!drag.x && !drag.y && !g.current) ? "transform .22s cubic-bezier(.2,.8,.2,1)" : "none",
          }}
        />
      </div>

      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2 pointer-events-none">
        <button onClick={onClose} aria-label="Close" className="pointer-events-auto size-11 rounded-full bg-black/50 flex items-center justify-center active:scale-90"><X size={24} /></button>
        {images.length > 1 && <span className="px-3 h-8 rounded-full bg-black/50 flex items-center text-[13.5px] tabular-nums">{i + 1} / {images.length}</span>}
        <span className="size-11" />
      </div>
      {images.length > 1 && i > 0 && <button onClick={() => go(-1)} aria-label="Previous photo" className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-black/50 items-center justify-center"><ChevronLeft size={26} /></button>}
      {images.length > 1 && i < images.length - 1 && <button onClick={() => go(1)} aria-label="Next photo" className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-black/50 items-center justify-center"><ChevronRight size={26} /></button>}
      {t.s <= 1.02 && (
        <p className="absolute bottom-[calc(18px+env(safe-area-inset-bottom))] inset-x-0 text-center text-[12.5px] text-white/55 pointer-events-none">Pinch or double-tap to zoom</p>
      )}
    </div>
  );
};

export default PhotoViewer;
