import { useEffect, useRef, useState, useCallback } from "react";
import { X, Check } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen wallpaper cropper. Shows the WHOLE picture; a frame (shaped like
// your screen) marks exactly what will be kept. Drag the frame to move it, drag
// a corner to resize it. "Free" lets you pick any shape. Whatever is inside the
// frame is what you get.
const MIN = 70;

const screenAspect = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // On a laptop the chat pane is the area right of the nav + chat list.
  return w >= 1024 ? Math.max(0.5, (w - 472) / h) : w / h;
};

const WallpaperCropper = ({ file, onCancel, onDone }) => {
  useBackToClose(true, onCancel);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const stageRef = useRef(null);
  const [img, setImg] = useState(null); // HTMLImageElement
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [locked, setLocked] = useState(true);
  const [box, setBox] = useState(null); // crop box in stage px
  const drag = useRef(null);
  const ar = useRef(screenAspect());

  // Load the picture
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => cancelRef.current();
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Measure the stage
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Where the picture sits inside the stage
  const fit = img && stage.w
    ? (() => {
        const s = Math.min(stage.w / img.naturalWidth, stage.h / img.naturalHeight);
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        return { s, w, h, x: (stage.w - w) / 2, y: (stage.h - h) / 2 };
      })()
    : null;

  // First frame: the biggest screen-shaped frame that fits, centred
  const fitKey = fit ? `${Math.round(fit.w)}x${Math.round(fit.h)}` : "";
  useEffect(() => {
    if (!fit) return;
    let w = fit.w;
    let h = w / ar.current;
    if (h > fit.h) {
      h = fit.h;
      w = h * ar.current;
    }
    setBox({ x: fit.x + (fit.w - w) / 2, y: fit.y + (fit.h - h) / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const toggleLock = (lock) => {
    setLocked(lock);
    if (lock && box && fit) {
      let w = box.w;
      let h = w / ar.current;
      if (h > fit.h) {
        h = fit.h;
        w = h * ar.current;
      }
      const x = Math.min(Math.max(box.x, fit.x), fit.x + fit.w - w);
      const y = Math.min(Math.max(box.y, fit.y), fit.y + fit.h - h);
      setBox({ x, y, w, h });
    }
  };

  const pt = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startDrag = (mode, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, start: pt(e), box: { ...box } };
  };

  const onMove = useCallback(
    (e) => {
      const d = drag.current;
      if (!d || !fit) return;
      const p = pt(e);
      const b = d.box;
      if (d.mode === "move") {
        const x = Math.min(Math.max(b.x + p.x - d.start.x, fit.x), fit.x + fit.w - b.w);
        const y = Math.min(Math.max(b.y + p.y - d.start.y, fit.y), fit.y + fit.h - b.h);
        setBox({ ...b, x, y });
        return;
      }
      // Corner resize: the opposite corner stays put.
      const left = d.mode.includes("l");
      const top = d.mode.includes("t");
      const ax = left ? b.x + b.w : b.x;
      const ay = top ? b.y + b.h : b.y;
      const px = Math.min(Math.max(p.x, fit.x), fit.x + fit.w);
      const py = Math.min(Math.max(p.y, fit.y), fit.y + fit.h);
      let w = Math.abs(px - ax);
      let h = Math.abs(py - ay);
      const maxW = left ? ax - fit.x : fit.x + fit.w - ax;
      const maxH = top ? ay - fit.y : fit.y + fit.h - ay;
      if (locked) {
        w = Math.max(w, h * ar.current);
        w = Math.min(w, maxW, maxH * ar.current);
        w = Math.max(w, Math.min(MIN, maxW, maxH * ar.current));
        h = w / ar.current;
      } else {
        w = Math.max(Math.min(w, maxW), Math.min(MIN, maxW));
        h = Math.max(Math.min(h, maxH), Math.min(MIN, maxH));
      }
      setBox({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
    },
    [fit, locked]
  );
  const endDrag = () => (drag.current = null);

  const done = () => {
    if (!img || !fit || !box) return;
    const sx = (box.x - fit.x) / fit.s;
    const sy = (box.y - fit.y) / fit.s;
    const sw = box.w / fit.s;
    const sh = box.h / fit.s;
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    onDone(c.toDataURL("image/jpeg", 0.82));
  };

  const handle = (mode, style) => (
    <span
      key={mode}
      onPointerDown={(e) => startDrag(mode, e)}
      className="absolute size-9 flex items-center justify-center touch-none"
      style={style}
    >
      <span className="size-4 rounded-full bg-white shadow ring-2 ring-black/30" />
    </span>
  );

  return (
    <div className="wa-dark fixed inset-0 z-[120] bg-black text-white flex flex-col select-none">
      <div className="flex items-center gap-4 px-4 h-14 shrink-0">
        <button onClick={onCancel} aria-label="Cancel" className="size-10 flex items-center justify-center">
          <X size={24} />
        </button>
        <h3 className="flex-1 text-[19px]">Crop wallpaper</h3>
        <button onClick={done} disabled={!box} className="h-10 px-5 rounded-full bg-[#21C063] text-black font-medium flex items-center gap-1.5 disabled:opacity-40">
          <Check size={18} /> Done
        </button>
      </div>

      <div
        ref={stageRef}
        className="flex-1 min-h-0 relative touch-none overflow-hidden"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {url && fit && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute pointer-events-none"
            style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}
          />
        )}
        {box && (
          <>
            {/* Dim everything outside the frame */}
            <div
              className="absolute pointer-events-none"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", border: "2px solid #fff" }}
            >
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="border border-white/50" style={{ borderWidth: "0.5px" }} />
                ))}
              </div>
            </div>
            <div
              onPointerDown={(e) => startDrag("move", e)}
              className="absolute cursor-move touch-none"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
            {handle("tl", { left: box.x - 18, top: box.y - 18 })}
            {handle("tr", { left: box.x + box.w - 18, top: box.y - 18 })}
            {handle("bl", { left: box.x - 18, top: box.y + box.h - 18 })}
            {handle("br", { left: box.x + box.w - 18, top: box.y + box.h - 18 })}
          </>
        )}
      </div>

      <div className="shrink-0 px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {[
            [true, "Fit my screen"],
            [false, "Free"],
          ].map(([v, label]) => (
            <button
              key={label}
              onClick={() => toggleLock(v)}
              className={`h-9 px-4 rounded-full text-[14px] border ${locked === v ? "bg-[#103629] border-transparent text-[#D9FDD3]" : "border-white/25 text-white/80"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-white/60 text-center">Drag the frame to move it, drag a corner to resize. Only what&apos;s inside becomes your wallpaper.</p>
      </div>
    </div>
  );
};

export default WallpaperCropper;
