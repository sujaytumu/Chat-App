import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pencil, Undo2, Check, Sticker, MapPin } from "lucide-react";

// Filled music note and crop-rotate icons (Material Design Icons, Apache 2.0) so the toolbar matches WhatsApp's.
const NoteIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);
const CropRotateIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7.47 21.49C4.2 19.93 1.86 16.76 1.5 13H0c.51 6.16 5.66 11 11.95 11 .23 0 .44-.02.66-.03L8.8 20.15l-1.33 1.34zM12.05 0c-.23 0-.44.02-.66.04l3.81 3.81 1.33-1.33C19.8 4.07 22.14 7.24 22.5 11H24c-.51-6.16-5.66-11-11.95-11zM16 14h2V8c0-1.11-.9-2-2-2h-6v2h6v6zm-8 2V4H6v2H4v2h2v8c0 1.1.89 2 2 2h8v2h2v-2h2v-2H8z" />
  </svg>
);

const COLORS = ["#FFFFFF", "#000000", "#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#BF5AF2", "#FF2D92"];
const EMOJIS = ["😂", "😍", "🔥", "🥰", "😎", "🙏", "👍", "❤️", "🎉", "😭", "😮", "💯", "✨", "🤝", "😘", "🥳"];

// Photo editor like WhatsApp's status editor: draw, add text, stickers, rotate.
// Everything stays editable on screen and is flattened into the picture on send.
const StatusPhotoEditor = forwardRef(function StatusPhotoEditor({ src, onClose, onMusic, hasSong, onRotated, onLocation, onModeChange }, ref) {
  const stage = useRef(null);
  const imgEl = useRef(null);
  const [mode, setMode] = useState(null); // null | draw | text | sticker
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState([]);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const drawing = useRef(null);
  const dragging = useRef(null);

  // Lets the screen hide its bottom bar while drawing / picking stickers / typing, like WhatsApp.
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const rel = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  // ---- drawing ----
  const down = (e) => {
    if (mode !== "draw") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = { color, pts: [rel(e)] };
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

  // ---- dragging text / stickers ----
  const itemDown = (e, id) => {
    if (mode === "draw") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = id;
  };
  const itemMove = (e) => {
    if (dragging.current == null) return;
    const [x, y] = rel(e);
    setItems((list) => list.map((it) => (it.id === dragging.current ? { ...it, x, y } : it)));
  };
  const itemUp = () => {
    dragging.current = null;
  };

  const addText = () => {
    const v = draft.trim();
    if (v) setItems((l) => [...l, { id: Date.now(), kind: "text", value: v, color, x: 0.5, y: 0.5 }]);
    setDraft("");
    setMode(null);
  };
  const addEmoji = (v) => {
    setItems((l) => [...l, { id: Date.now(), kind: "emoji", value: v, x: 0.5, y: 0.5 }]);
    setMode(null);
  };

  const rotate = async () => {
    const img = imgEl.current;
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = img.naturalHeight;
    c.height = img.naturalWidth;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    setStrokes([]);
    setItems([]);
    onRotated?.(c.toDataURL("image/jpeg", 0.88));
  };

  useImperativeHandle(ref, () => ({
    hasEdits: () => strokes.length > 0 || items.length > 0,
    // Flatten photo + drawing + text + stickers into one JPEG (null if untouched).
    async exportImage() {
      if (!strokes.length && !items.length) return null;
      const img = imgEl.current;
      const sw = stage.current.clientWidth;
      const scale = Math.min(1, 1080 / img.naturalWidth);
      const cw = Math.round(img.naturalWidth * scale);
      const ch = Math.round(img.naturalHeight * scale);
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes) {
        if (s.pts.length < 1) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = (5 / sw) * cw;
        ctx.beginPath();
        s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * cw, y * ch) : ctx.moveTo(x * cw, y * ch)));
        if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * cw + 0.1, s.pts[0][1] * ch);
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const it of items) {
        if (it.kind === "emoji") {
          ctx.font = `${cw * 0.16}px sans-serif`;
          ctx.fillText(it.value, it.x * cw, it.y * ch);
        } else {
          ctx.font = `bold ${cw * 0.075}px system-ui, sans-serif`;
          ctx.fillStyle = it.color;
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = cw * 0.01;
          ctx.fillText(it.value, it.x * cw, it.y * ch, cw * 0.9);
          ctx.shadowBlur = 0;
        }
      }
      return c.toDataURL("image/jpeg", 0.88);
    },
  }));

  const tb = "size-12 rounded-full bg-[#101418] text-white flex items-center justify-center active:bg-[#1c242b]";

  return (
    <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden select-none">
      <div ref={stage} className="relative inline-flex max-w-full max-h-full">
        <img ref={imgEl} src={src} alt="Status preview" draggable={false} className="block max-w-full max-h-[calc(100dvh-440px)] object-contain" />

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
          {strokes.map((s, i) => (
            <polyline
              key={i}
              points={s.pts.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {items.map((it) => (
          <div
            key={it.id}
            onPointerDown={(e) => itemDown(e, it.id)}
            onPointerMove={itemMove}
            onPointerUp={itemUp}
            onPointerCancel={itemUp}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab"
            style={{
              left: `${it.x * 100}%`,
              top: `${it.y * 100}%`,
              touchAction: "none",
              color: it.color,
              fontSize: it.kind === "emoji" ? "min(16vw, 80px)" : "min(7.5vw, 38px)",
              fontWeight: it.kind === "text" ? 700 : 400,
              textShadow: it.kind === "text" ? "0 1px 4px rgba(0,0,0,.6)" : undefined,
              lineHeight: 1.1,
              maxWidth: "90%",
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {it.value}
          </div>
        ))}
      </div>

      {/* Top toolbar */}
      <div className="absolute top-0 inset-x-0 flex items-center gap-1.5 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
        <button onClick={onClose} aria-label="Close" className={tb}>
          <span className="text-[22px] leading-none">✕</span>
        </button>
        <div className="flex-1" />
        <button onClick={onMusic} aria-label="Add music" className={`${tb} ${hasSong ? "!bg-[#21C063] !text-black" : ""}`}>
          <NoteIcon size={22} />
        </button>
        <button onClick={rotate} aria-label="Rotate" className={tb}>
          <CropRotateIcon size={24} />
        </button>
        <button onClick={() => setMode(mode === "sticker" ? null : "sticker")} aria-label="Stickers" className={`${tb} ${mode === "sticker" ? "!bg-white !text-black" : ""}`}>
          <Sticker size={22} />
        </button>
        <button onClick={() => setMode("text")} aria-label="Add text" className={`${tb} text-[20px] font-medium`}>
          Aa
        </button>
        <button onClick={() => setMode(mode === "draw" ? null : "draw")} aria-label="Draw" className={`${tb} ${mode === "draw" ? "!bg-white !text-black" : ""}`}>
          <Pencil size={21} />
        </button>
      </div>

      {/* Draw: colours + undo */}
      {mode === "draw" && (
        <div className="absolute bottom-[calc(12px+env(safe-area-inset-bottom))] inset-x-3 flex items-center gap-2 rounded-full bg-[#101418] px-3 py-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={`size-7 rounded-full border-2 ${color === c ? "border-white scale-110" : "border-white/30"}`} style={{ backgroundColor: c }} />
          ))}
          <div className="flex-1" />
          <button onClick={() => setStrokes((s) => s.slice(0, -1))} className="size-9 flex items-center justify-center text-white" aria-label="Undo">
            <Undo2 size={20} />
          </button>
          <button onClick={() => setMode(null)} className="size-9 flex items-center justify-center text-white" aria-label="Done drawing">
            <Check size={22} />
          </button>
        </div>
      )}

      {/* Stickers */}
      {mode === "sticker" && (
        <div className="absolute bottom-[calc(12px+env(safe-area-inset-bottom))] inset-x-3 rounded-2xl bg-[#101418] p-3 grid grid-cols-8 gap-1">
          <button
            onClick={() => {
              setMode(null);
              onLocation?.();
            }}
            className="col-span-8 mb-1 flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 text-left text-[14px] text-white active:bg-white/15"
          >
            <MapPin size={20} className="text-[#F15C6D]" /> Location
          </button>
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => addEmoji(e)} className="text-[26px] leading-none py-1.5 active:scale-90">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Text entry */}
      {mode === "text" && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-5 px-6">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addText()}
            maxLength={80}
            placeholder="Type text"
            className="w-full bg-transparent text-center text-[30px] font-bold outline-none placeholder:text-white/50"
            style={{ color }}
          />
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={`size-7 rounded-full border-2 ${color === c ? "border-white scale-110" : "border-white/30"}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <button onClick={addText} className="h-11 px-8 rounded-full bg-[#21C063] text-black font-medium">
            Done
          </button>
        </div>
      )}
    </div>
  );
});

export default StatusPhotoEditor;
