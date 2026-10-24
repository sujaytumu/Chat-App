import { useEffect, useRef, useState, useCallback } from "react";
import { X, Check, RotateCcw } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen wallpaper cropper. Shows the WHOLE picture; a frame (shaped like
// your screen) marks exactly what will be kept. Drag the frame to move it, drag
// a corner to resize it. "Free" lets you pick any shape. Whatever is inside the
// frame is what you get.
const MIN = 70;
const PAD = 22; // WhatsApp variant: breathing room around the picture so edge handles are reachable
const RATIOS = [["Free", null], ["Square", 1], ["4:5", 4 / 5], ["3:4", 3 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9]];

const screenAspect = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // On a laptop the chat pane is the area right of the nav + chat list.
  return w >= 1024 ? Math.max(0.5, (w - 472) / h) : w / h;
};

const WallpaperCropper = ({ file, onCancel, onDone, title = "Crop wallpaper", aspectRatio, lockLabel = "Fit my screen", maxSize = 1600, hint, initialLocked = true, zIndex = 120, variant = "default" }) => {
  const wa = variant === "whatsapp"; // WhatsApp-style: bracket frame, edge handles, Cancel · rotate · Done bar
  useBackToClose(true, onCancel);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const stageRef = useRef(null);
  const [img, setImg] = useState(null); // HTMLImageElement
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [locked, setLocked] = useState(initialLocked);
  const [box, setBox] = useState(null); // crop box in stage px
  const drag = useRef(null);
  const [resetN, setResetN] = useState(0); // bumps to re-frame after a rotate
  const [ratioName, setRatioName] = useState("Free");
  const ar = useRef(aspectRatio || screenAspect());

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
        const pad = wa ? PAD : 0;
        const s = Math.min((stage.w - pad * 2) / img.naturalWidth, (stage.h - pad * 2) / img.naturalHeight);
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        return { s, w, h, x: (stage.w - w) / 2, y: (stage.h - h) / 2 };
      })()
    : null;

  // First frame: the biggest screen-shaped frame that fits, centred
  const fitKey = fit ? `${Math.round(fit.w)}x${Math.round(fit.h)}` : "";
  useEffect(() => {
    if (!fit) return;
    if (wa && !locked) {
      setBox({ x: fit.x, y: fit.y, w: fit.w, h: fit.h });
      return;
    }
    let w = fit.w;
    let h = w / ar.current;
    if (h > fit.h) {
      h = fit.h;
      w = h * ar.current;
    }
    setBox({ x: fit.x + (fit.w - w) / 2, y: fit.y + (fit.h - h) / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, resetN]);

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
      if (d.mode.length === 1) {
        // Edge resize (free mode): only that side moves.
        let { x, y, w, h } = b;
        if (d.mode === "l") {
          const nx = Math.min(Math.max(p.x, fit.x), b.x + b.w - MIN);
          x = nx;
          w = b.x + b.w - nx;
        } else if (d.mode === "r") {
          w = Math.min(Math.max(p.x - b.x, MIN), fit.x + fit.w - b.x);
        } else if (d.mode === "t") {
          const ny = Math.min(Math.max(p.y, fit.y), b.y + b.h - MIN);
          y = ny;
          h = b.y + b.h - ny;
        } else {
          h = Math.min(Math.max(p.y - b.y, MIN), fit.y + fit.h - b.y);
        }
        setBox({ x, y, w, h });
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
    const scale = Math.min(1, maxSize / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    onDone(c.toDataURL("image/jpeg", 0.82));
  };

  const rotate = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = img.naturalHeight;
    c.height = img.naturalWidth;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const u = c.toDataURL("image/jpeg", 0.92);
    const im = new Image();
    im.onload = () => {
      setUrl(u);
      setImg(im);
      if (locked && !aspectRatio) ar.current = 1 / ar.current; // a turned picture wants the turned frame
      setResetN((n) => n + 1);
    };
    im.src = u;
  };

  const pickRatio = ([name, r]) => {
    setRatioName(name);
    if (r == null) setLocked(false);
    else {
      ar.current = r;
      setLocked(true);
    }
    setResetN((n) => n + 1);
  };

  const handle = (mode, style) => (
    <span
      key={mode}
      onPointerDown={(e) => startDrag(mode, e)}
      className="absolute size-9 flex items-center justify-center touch-none"
      style={style}
    >
      {!wa && <span className="size-4 rounded-full bg-white shadow ring-2 ring-black/30" />}
    </span>
  );
  const edge = (mode, style) => (
    <span key={mode} onPointerDown={(e) => startDrag(mode, e)} className="absolute touch-none" style={style} />
  );

  return (
    <div className="wa-dark fixed inset-0 bg-black text-white flex flex-col select-none" style={{ zIndex }}>
      {wa ? (
        <div className="h-[calc(24px+env(safe-area-inset-top))] shrink-0" />
      ) : (
        <div className="flex items-center gap-4 px-4 h-14 shrink-0">
          <button onClick={onCancel} aria-label="Cancel" className="size-10 flex items-center justify-center">
            <X size={24} />
          </button>
          <h3 className="flex-1 text-[16px]">{title}</h3>
          <button onClick={done} disabled={!box} className="h-10 px-5 rounded-full bg-[#21C063] text-black font-medium flex items-center gap-1.5 disabled:opacity-40">
            <Check size={18} /> Done
          </button>
        </div>
      )}

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
              style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", border: wa ? "1px solid rgba(255,255,255,.55)" : "2px solid #fff" }}
            >
              {wa && (
                <>
                  {/* thick corner brackets + short edge bars, like WhatsApp */}
                  <span className="absolute -left-px -top-px w-6 h-6 border-l-[3px] border-t-[3px] border-white" />
                  <span className="absolute -right-px -top-px w-6 h-6 border-r-[3px] border-t-[3px] border-white" />
                  <span className="absolute -left-px -bottom-px w-6 h-6 border-l-[3px] border-b-[3px] border-white" />
                  <span className="absolute -right-px -bottom-px w-6 h-6 border-r-[3px] border-b-[3px] border-white" />
                  {!locked && (
                    <>
                      <span className="absolute left-1/2 -top-px -translate-x-1/2 w-8 h-[3px] bg-white" />
                      <span className="absolute left-1/2 -bottom-px -translate-x-1/2 w-8 h-[3px] bg-white" />
                      <span className="absolute top-1/2 -left-px -translate-y-1/2 h-8 w-[3px] bg-white" />
                      <span className="absolute top-1/2 -right-px -translate-y-1/2 h-8 w-[3px] bg-white" />
                    </>
                  )}
                </>
              )}
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
            {wa && !locked && edge("l", { left: box.x - 16, top: box.y + 18, width: 32, height: Math.max(0, box.h - 36) })}
            {wa && !locked && edge("r", { left: box.x + box.w - 16, top: box.y + 18, width: 32, height: Math.max(0, box.h - 36) })}
            {wa && !locked && edge("t", { left: box.x + 18, top: box.y - 16, width: Math.max(0, box.w - 36), height: 32 })}
            {wa && !locked && edge("b", { left: box.x + 18, top: box.y + box.h - 16, width: Math.max(0, box.w - 36), height: 32 })}
            {handle("tl", { left: box.x - 18, top: box.y - 18 })}
            {handle("tr", { left: box.x + box.w - 18, top: box.y - 18 })}
            {handle("bl", { left: box.x - 18, top: box.y + box.h - 18 })}
            {handle("br", { left: box.x + box.w - 18, top: box.y + box.h - 18 })}
          </>
        )}
      </div>

      {wa ? (
        <div className="shrink-0 pb-[env(safe-area-inset-bottom)] box-content">
        {!aspectRatio && (
          <div className="flex gap-2 px-4 pb-1 overflow-x-auto no-scrollbar justify-start sm:justify-center">
            {RATIOS.map((r) => (
              <button
                key={r[0]}
                onClick={() => pickRatio(r)}
                className={`shrink-0 h-8 px-3.5 rounded-full text-[12.5px] ${ratioName === r[0] ? "bg-white text-black font-medium" : "bg-white/10 text-white/85"}`}
              >
                {r[0]}
              </button>
            ))}
          </div>
        )}
        <div className="h-[64px] flex items-center justify-between px-8">
          <button onClick={onCancel} className="text-[16px] text-[#21C063] py-3 pr-4">
            Cancel
          </button>
          <button onClick={rotate} aria-label="Rotate" className="size-11 flex items-center justify-center text-white">
            <RotateCcw size={26} />
          </button>
          <button onClick={done} disabled={!box} className="text-[16px] text-[#21C063] py-3 pl-4 disabled:opacity-40">
            Done
          </button>
        </div>
        </div>
      ) : (
      <div className="shrink-0 px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {[
            [true, lockLabel],
            [false, "Free"],
          ].map(([v, label]) => (
            <button
              key={label}
              onClick={() => toggleLock(v)}
              className={`h-9 px-4 rounded-full text-[12px] border ${locked === v ? "bg-[#103629] border-transparent text-[#D9FDD3]" : "border-white/25 text-white/80"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10.5px] text-white/60 text-center">Drag the frame to move it, drag a corner to resize. {hint || "Only what&apos;s inside becomes your wallpaper."}</p>
      </div>
      )}
    </div>
  );
};

export default WallpaperCropper;
