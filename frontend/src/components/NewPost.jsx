import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ImagePlus, Camera, Plus, Music, Loader2, SlidersHorizontal, Crop, Palette, Type, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { readFileAsBase64 } from "../lib/fileUtils";
import StatusMusicSheet from "./StatusMusicSheet";
import StatusAudienceSheet, { audienceLabel } from "./StatusAudienceSheet";
import { useAuthStore } from "../store/useAuthStore";
import { draftPut, draftGet, draftDel, draftGetPrefix, draftDelPrefix } from "../lib/draftStore";

// New post, in three calm steps (like Instagram):  1 pick photos  ->  2 edit (audio, filter, edit, ratio)  ->  3 details + Share.
// Performance: every photo is shrunk ONCE from the file (full copy for upload, tiny copy for the grid), the
// edits are only CSS while you play with them, and are baked into the picture one at a time when you press Share.

const MAX = 100; // photos that can wait in one go
const PER_POST = 10; // one post holds up to 10; more are posted as several posts, in order
const FILTERS = [
  { id: "none", label: "Original", css: "" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.05)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.2) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.02)" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.1)" },
  { id: "fade", label: "Fade", css: "contrast(0.9) brightness(1.1) saturate(0.85)" },
  { id: "drama", label: "Drama", css: "contrast(1.25) saturate(1.1) brightness(0.95)" },
];
const RATIOS = [
  { id: "orig", label: "Original", ar: 0 },
  { id: "sq", label: "1:1", ar: 1 },
  { id: "port", label: "4:5", ar: 0.8 },
];
const TEXT_COLORS = ["#ffffff", "#111111", "#ffd43b", "#21C063", "#ff6b9d", "#4dabf7"];
const TEXT_POS = [["top", "Top", 0.12], ["mid", "Middle", 0.5], ["bot", "Bottom", 0.88]];
const TEXT_SIZES = [["S", 0.7], ["M", 1], ["L", 1.5]];
const textFont = (w, k) => Math.max(10, w * 0.055 * k); // text size follows the photo width, so preview and final picture match
const canBake = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

const cssFilter = (it) => {
  const f = FILTERS.find((x) => x.id === it.filter)?.css || "";
  const extra = it.b !== 1 || it.c !== 1 ? `brightness(${it.b}) contrast(${it.c})` : "";
  return `${f} ${extra}`.trim() || "none";
};
const isPlain = (it) => it.filter === "none" && it.b === 1 && it.c === 1 && it.ratio === "orig" && !it.text;
const nextFrame = () => new Promise((r) => setTimeout(r, 30));
const uid = () => Math.random().toString(36).slice(2, 9);

// One pass over a picked file: a full-size copy (<=1440px) and a tiny one for the grid.
// Every kind of photo is accepted. The file is opened the best way the phone can (upright, memory-light); if the
// phone itself cannot decode it (HEIC and some rare formats), the original is sent as it is and the server
// converts it - the photo still gets posted.
const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#2a3942"/><g fill="none" stroke="#8696a0" stroke-width="8" stroke-linejoin="round"><rect x="62" y="78" width="116" height="90" rx="10"/><circle cx="120" cy="123" r="22"/></g></svg>');
const fileToDataUrl = (file, mime) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      let out = String(r.result);
      if (!out.startsWith("data:image/")) out = out.replace(/^data:[^;,]*/, `data:${mime}`);
      res(out);
    };
    r.onerror = () => rej(new Error("unreadable"));
    r.readAsDataURL(file);
  });
const drawScaled = (source, w, h) => {
  const make = (max, q) => {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", q);
    c.width = c.height = 0;
    if (!out.startsWith("data:image/jpeg")) throw new Error("canvas refused");
    return out;
  };
  return { src: make(1440, 0.82), thumb: make(240, 0.7), ar0: w / h };
};
const loadImg = (url) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("bad image"));
    img.src = url;
  });
const prepare = async (file) => {
  // 1. straight from the file, already turned upright
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      try { return drawScaled(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
    }
  } catch { /* try the next way */ }
  // 2. as a normal picture from the file
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    return drawScaled(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } catch { /* try the next way */ } finally {
    URL.revokeObjectURL(url);
  }
  // 3. as a picture read into memory first
  try {
    const img = await loadImg(await fileToDataUrl(file, file.type || "image/jpeg"));
    return drawScaled(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } catch { /* try the next way */ }
  // 4. the phone cannot decode it: send the original, the server converts it to JPEG
  const ext = (file.name?.split(".").pop() || "").toLowerCase();
  const mime = file.type && file.type.startsWith("image/") ? file.type : `image/${ext === "jpg" ? "jpeg" : ext || "heic"}`;
  const src = await fileToDataUrl(file, mime);
  return { src, thumb: PLACEHOLDER, ar0: 1, raw: true, name: file.name || "photo" };
};

// Bake the chosen look + crop into the picture (only when something was changed).
const bake = (it) =>
  new Promise((res) => {
    if (isPlain(it)) return res(it.src);
    const img = new Image();
    img.onload = () => {
      try {
        const ar = RATIOS.find((r) => r.id === it.ratio)?.ar || 0;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ar) {
          if (sw / sh > ar) { sw = Math.round(sh * ar); sx = Math.round((img.width - sw) / 2); }
          else { sh = Math.round(sw / ar); sy = Math.round((img.height - sh) / 2); }
        }
        const c = document.createElement("canvas");
        c.width = sw;
        c.height = sh;
        const ctx = c.getContext("2d");
        if (canBake) ctx.filter = cssFilter(it);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        if (it.text) {
          ctx.filter = "none";
          const fs = textFont(sw, it.tsize);
          ctx.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";
          const maxW = sw * 0.88;
          const out = [];
          for (const para of it.text.split("\n")) {
            let line = "";
            for (const word of para.split(" ")) {
              const test = line ? `${line} ${word}` : word;
              if (line && ctx.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
            }
            out.push(line);
          }
          const lh = fs * 1.25;
          const cy = (TEXT_POS.find((t) => t[0] === it.tpos)?.[2] ?? 0.88) * sh;
          let y = Math.min(Math.max(cy - ((out.length - 1) * lh) / 2, lh / 2 + 4), sh - lh / 2 - 4 - (out.length - 1) * lh);
          for (const l of out) {
            ctx.strokeStyle = "rgba(0,0,0,0.55)";
            ctx.lineWidth = fs * 0.14;
            ctx.strokeText(l, sw / 2, y);
            ctx.fillStyle = it.tcolor;
            ctx.fillText(l, sw / 2, y);
            y += lh;
          }
        }
        const out = c.toDataURL("image/jpeg", 0.85);
        c.width = c.height = 0;
        res(out);
      } catch {
        res(it.src);
      }
    };
    img.onerror = () => res(it.src);
    img.src = it.src;
  });

// A photo shown with its current look (CSS only, so it is instant), fitted inside a box of exact size
const Shot = ({ it, box }) => {
  const ar = RATIOS.find((r) => r.id === it.ratio)?.ar || it.ar0 || 1;
  if (!box.w || !box.h) return null;
  let w = box.w;
  let h = box.h;
  if (w / h > ar) w = h * ar;
  else h = w / ar;
  return (
    <div className="overflow-hidden" style={{ width: Math.floor(w), height: Math.floor(h) }}>
      <div className="relative w-full h-full">
        <img src={it.raw ? it.thumb : it.src} alt="" draggable={false} style={{ filter: it.raw ? "none" : cssFilter(it) }} className={`w-full h-full ${it.raw ? "object-contain bg-[#2a3942]" : "object-cover"}`} />
        {it.text && (
          <div className="absolute inset-x-0 text-center font-bold leading-[1.25] whitespace-pre-wrap break-words pointer-events-none" style={{ top: `${(TEXT_POS.find((t) => t[0] === it.tpos)?.[2] ?? 0.88) * 100}%`, transform: "translateY(-50%)", padding: "0 6%", fontSize: textFont(Math.floor(w), it.tsize), color: it.tcolor, textShadow: "0 0 3px rgba(0,0,0,.7), 0 1px 4px rgba(0,0,0,.6), 1px 1px 0 rgba(0,0,0,.35), -1px -1px 0 rgba(0,0,0,.35)" }}>{it.text}</div>
        )}
      </div>
    </div>
  );
};

const NewPost = ({ onClose, onPosted, embedded = false }) => {
  const [step, setStep] = useState("pick"); // pick | edit | details
  const [items, setItems] = useState([]); // { id, src, thumb, filter, b, c, ratio }
  const [cur, setCur] = useState(0);
  const [tool, setTool] = useState(null); // null | filter | edit | ratio
  const [caption, setCaption] = useState("");
  const [lines, setLines] = useState("");
  const [song, setSong] = useState(null);
  const [showMusic, setShowMusic] = useState(false);
  const [audience, setAudience] = useState(null); // null = my default for posts
  const [showAudience, setShowAudience] = useState(false);
  useEffect(() => {
    axiosInstance.get("/privacy").then((r) => setAudience((cur) => cur || r.data.posts)).catch(() => {});
  }, []);
  const [prep, setPrep] = useState(null);
  const [stage, setStage] = useState(null); // text while sharing
  const gallery = useRef(null);
  const camera = useRef(null);
  const songInput = useRef(null);
  const slides = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 }); // size of the preview area on the edit step
  const busy = !!stage;

  // Unfinished post is kept on this device (photos with their edits, caption, audio): an update, a reload or
  // leaving the app never loses it. Each photo is saved once; only changed ones are written again.
  const draftBase = `post:${useAuthStore.getState().authUser?._id || "me"}:`;
  const loaded = useRef(false);
  const savedItems = useRef(new WeakSet());
  useEffect(() => {
    let live = true;
    (async () => {
      const meta = await draftGet(`${draftBase}meta`);
      if (meta?.order?.length && live) {
        const rows = new Map(await draftGetPrefix(`${draftBase}item:`));
        const back = meta.order.map((id) => rows.get(`${draftBase}item:${id}`)).filter(Boolean);
        if (back.length) {
          back.forEach((x) => savedItems.current.add(x));
          setItems(back);
          setCaption(meta.caption || "");
          setLines(meta.lines || "");
          if (meta.song) setSong(meta.song);
          setStep(meta.step === "pick" ? "pick" : "edit");
          toast(`Your ${back.length} photo${back.length === 1 ? "" : "s"} ${back.length === 1 ? "is" : "are"} still here`, { icon: "📥" });
        }
      }
      loaded.current = true;
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded.current) return undefined;
    const t = setTimeout(async () => {
      if (busy) return;
      if (!items.length) { draftDelPrefix(draftBase); return; }
      const keep = new Set(items.map((x) => x.id));
      for (const x of items) {
        if (!savedItems.current.has(x)) { savedItems.current.add(x); await draftPut(`${draftBase}item:${x.id}`, x); }
      }
      const stored = await draftGetPrefix(`${draftBase}item:`);
      for (const [k] of stored) if (!keep.has(k.slice(`${draftBase}item:`.length))) draftDel(k);
      draftPut(`${draftBase}meta`, { order: items.map((x) => x.id), caption, lines, song, step });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, caption, lines, song, step, busy]);

  const safeCur = Math.min(cur, Math.max(0, items.length - 1));
  const it = items[safeCur];
  const patch = (i, p) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const add = async (e) => {
    const chosen = [...(e.target.files || [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|heics|jpe?g|jfif|png|webp|avif|gif|bmp|tiff?|dng|raw|arw|cr2|nef|orf)$/i.test(f.name || ""));
    e.target.value = "";
    const room = MAX - items.length;
    if (chosen.length > room) toast(`Only ${room} more photo${room === 1 ? "" : "s"} fit (max ${MAX}) - the first ${room} were taken`);
    const files = chosen.slice(0, Math.max(0, room));
    if (!files.length) return;
    let done = 0;
    let failed = 0;
    const failedNames = [];
    setPrep({ done: 0, total: files.length });
    for (const f of files) {
      try {
        const p = await prepare(f);
        if (p.raw && p.src.length > 12.5 * 1000 * 1000) throw new Error("too big to send as it is"); // the phone can't shrink it and the server takes ~9 MB per photo
        setItems((l) => (l.length < MAX ? [...l, { id: uid(), ...p, filter: "none", b: 1, c: 1, ratio: "orig", text: "", tcolor: "#ffffff", tpos: "bot", tsize: 1 }] : l));
      } catch (err) {
        failed++;
        failedNames.push(`${f.name || "photo"} (${(f.size / 1048576).toFixed(1)} MB)`);
        console.warn("Photo not added:", f.name, f.type, f.size, err?.message);
      }
      done++;
      setPrep({ done, total: files.length });
      await nextFrame();
    }
    setPrep(null);
    if (failed) toast.error(`Couldn't add: ${failedNames.slice(0, 3).join(", ")}${failed > 3 ? ` and ${failed - 3} more` : ""} - this phone can't open ${failed === 1 ? "it" : "them"} and ${failed === 1 ? "it is" : "they are"} too big to send as ${failed === 1 ? "it is" : "they are"}`, { duration: 7000 });
  };

  // when new photos arrive, show the newest one
  const count = items.length;
  const lastCount = useRef(0);
  useEffect(() => {
    if (count > lastCount.current) setCur(count - 1);
    lastCount.current = count;
  }, [count]);

  const remove = (i) => {
    setItems((l) => l.filter((_, k) => k !== i));
    setCur((c) => (c > i ? c - 1 : c));
  };

  const goSlide = (i) => {
    setCur(i);
    const el = slides.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onSlideScroll = (e) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== cur) setCur(i);
  };
  // edit step: measure the preview area (so every photo is fitted exactly) and jump to the chosen photo
  useEffect(() => {
    const el = slides.current;
    if (step !== "edit" || !el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    el.scrollTo({ left: safeCur * el.clientWidth });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const share = async () => {
    if (!items.length || busy) return;
    // up to 10 photos per post and about 15 MB per request: a post is filled until either is reached
    const batches = [];
    let curBatch = [];
    let curBytes = 0;
    for (const x of items) {
      const n = x.src.length;
      if (curBatch.length && (curBatch.length >= PER_POST || curBytes + n > 15 * 1000 * 1000)) { batches.push(curBatch); curBatch = []; curBytes = 0; }
      curBatch.push(x);
      curBytes += n;
    }
    if (curBatch.length) batches.push(curBatch);
    let last = null;
    let postedPhotos = 0;
    try {
      for (let b = 0; b < batches.length; b++) {
        const group = batches[b];
        const tag = batches.length > 1 ? ` (post ${b + 1} of ${batches.length})` : "";
        const out = [];
        for (let i = 0; i < group.length; i++) {
          setStage((group.some((x) => !isPlain(x)) ? `Preparing photos ${i + 1}/${group.length}` : "Preparing…") + tag);
          out.push(await bake({ ...group[i], text: "" })); // the line on a photo is kept as text (editable later), not burnt into the picture
          await nextFrame();
        }
        setStage(`Uploading ${out.length} photo${out.length === 1 ? "" : "s"}${tag} - keep this screen open`);
        const { data } = await axiosInstance.post("/posts", { images: out, caption, lines, photoText: group.map((x) => ({ text: x.text || "", color: x.tcolor, pos: x.tpos, size: x.tsize })), ...(song ? { song: { data: song.data, name: song.name } } : {}), ...(audience ? { audience } : {}) }, { timeout: 180000 });
        last = data;
        postedPhotos += group.length;
        // what is already posted leaves the draft, so a retry never posts it twice
        const posted = new Set(group.map((x) => x.id));
        setItems((l) => l.filter((x) => !posted.has(x.id)));
      }
      await draftDelPrefix(draftBase);
      onPosted(last);
    } catch (e) {
      toast.error(e.response?.data?.error || (postedPhotos ? `${postedPhotos} photos were posted; the rest are saved - tap Share to continue` : "Couldn't post - check your connection and try again"));
      setStage(null);
    }
  };

  const back = () => {
    if (busy) return;
    if (step === "details") setStep("edit");
    else if (step === "edit") { setTool(null); setStep("pick"); }
    else onClose();
  };

  const iconBtn = "size-10 -ml-2 flex items-center justify-center rounded-full active:bg-white/10";
  const header = (title, right) => (
    <div className="flex items-center gap-2 px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2 shrink-0">
      <button onClick={back} aria-label={step === "pick" ? "Close" : "Back"} className={iconBtn}>{step === "pick" ? <X size={26} /> : <ChevronLeft size={28} />}</button>
      <h3 className="flex-1 text-[19px] font-semibold">{title}</h3>
      {right}
    </div>
  );
  const songChip = (
    <button onClick={() => setShowMusic(true)} className="mx-auto flex items-center gap-2.5 max-w-[88%] h-11 pl-3 pr-3.5 rounded-2xl bg-wa-field active:bg-wa-surface text-[14.5px]">
      <Music size={18} className="text-[#21C063] shrink-0" />
      <span className="truncate">{song ? song.name : "Add audio"}</span>
      {song ? <X size={16} className="text-wa-muted shrink-0" onClick={(e) => { e.stopPropagation(); setSong(null); }} /> : <Plus size={18} className="text-wa-muted shrink-0" />}
    </button>
  );

  return (
    <div className={`${embedded ? "absolute inset-0" : "fixed inset-0 z-[80]"} bg-wa-bg text-wa-text flex flex-col`}>
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={add} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={add} />

      {/* ───────── 1. PICK ───────── */}
      {step === "pick" && (
        <>
          {header("New post", <button disabled={!items.length || !!prep} onClick={() => setStep("edit")} className="px-1 text-[17px] font-semibold text-[#21C063] disabled:opacity-40">Next</button>)}
          <div className="relative w-full aspect-square bg-black shrink-0 flex items-center justify-center overflow-hidden">
            {it ? (
              <img src={it.raw ? it.thumb : it.src} alt="" className="w-full h-full object-contain" />
            ) : (
              <button onClick={() => gallery.current?.click()} className="flex flex-col items-center gap-3 text-wa-muted active:scale-95 transition-transform">
                <span className="size-20 rounded-full bg-wa-field flex items-center justify-center"><ImagePlus size={34} /></span>
                <span className="text-[16px] text-wa-text">Choose photos</span>
                <span className="text-[13px]">Up to {MAX} at once ({PER_POST} per post)</span>
              </button>
            )}
            {prep && <div className="absolute bottom-3 left-3 px-3 h-8 rounded-full bg-black/70 flex items-center gap-2 text-[13px] text-white"><Loader2 size={14} className="animate-spin" /> Getting photos ready… {prep.done}/{prep.total}</div>}
          </div>
          <div className="flex items-center justify-between px-4 h-14 shrink-0">
            <span className="text-[17px] font-medium">{items.length ? `Selected ${items.length}/${MAX}` : "Your photos"}</span>
            <button onClick={() => gallery.current?.click()} disabled={items.length >= MAX || !!prep} className="h-9 px-4 rounded-full bg-wa-field text-[14.5px] font-medium disabled:opacity-40 flex items-center gap-1.5 active:scale-95"><Plus size={16} /> Add photos</button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-4 gap-0.5">
              <button onClick={() => camera.current?.click()} disabled={items.length >= MAX || !!prep} className="aspect-square bg-wa-field flex items-center justify-center text-wa-muted disabled:opacity-40 active:bg-wa-surface" aria-label="Take a photo"><Camera size={30} /></button>
              <button onClick={() => gallery.current?.click()} disabled={items.length >= MAX || !!prep} className="aspect-square bg-wa-field flex items-center justify-center text-wa-muted disabled:opacity-40 active:bg-wa-surface" aria-label="Choose from gallery"><ImagePlus size={30} /></button>
              {items.map((x, i) => (
                <div key={x.id} className="relative aspect-square bg-black" onClick={() => setCur(i)}>
                  <img src={x.thumb} alt="" loading="lazy" decoding="async" className={`w-full h-full object-cover ${i === safeCur ? "" : "opacity-60"}`} />
                  <span className={`absolute top-1.5 right-1.5 size-6 rounded-full flex items-center justify-center text-[13px] font-semibold text-white ${i === safeCur ? "bg-[#21C063] ring-2 ring-white" : "bg-[#3b5bdb]"}`}>{i + 1}</span>
                  <button onClick={(e) => { e.stopPropagation(); remove(i); }} aria-label="Remove photo" className="absolute top-1 left-1 size-7 rounded-full bg-black/60 flex items-center justify-center text-white"><X size={15} /></button>
                </div>
              ))}
            </div>
            {!items.length && <p className="px-6 pt-8 text-center text-[14px] text-wa-muted">Tap the gallery or camera tile to add photos. The order you pick them in is the order they show in the post.</p>}
          </div>
        </>
      )}

      {/* ───────── 2. EDIT ───────── */}
      {step === "edit" && it && (
        <>
          {header("", <button onClick={() => setStep("details")} className="px-1 text-[17px] font-semibold text-[#21C063]">Next</button>)}
          <div className="shrink-0 pb-2 flex justify-center">{songChip}</div>
          <div ref={slides} onScroll={onSlideScroll} className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
            {items.map((x) => (
              <div key={x.id} className="w-full shrink-0 snap-center h-full flex items-center justify-center bg-black">
                <Shot it={x} box={box} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-1.5 py-2.5 shrink-0">
            {items.map((x, i) => <span key={x.id} className={`size-1.5 rounded-full ${i === safeCur ? "bg-white" : "bg-white/35"}`} />)}
          </div>

          {tool === "filter" && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-3 shrink-0">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => patch(safeCur, { filter: f.id })} className="shrink-0 flex flex-col items-center gap-1.5">
                  <img src={it.thumb} alt="" style={{ filter: f.css || "none" }} className={`size-16 rounded-xl object-cover ${it.filter === f.id ? "ring-2 ring-[#21C063]" : ""}`} />
                  <span className={`text-[12px] ${it.filter === f.id ? "text-[#21C063]" : "text-wa-muted"}`}>{f.label}</span>
                </button>
              ))}
            </div>
          )}
          {tool === "edit" && (
            <div className="px-5 pb-3 shrink-0 space-y-2.5">
              {[["Brightness", "b", 0.6, 1.4], ["Contrast", "c", 0.7, 1.3]].map(([label, key, lo, hi]) => (
                <label key={key} className="flex items-center gap-3 text-[13.5px]">
                  <span className="w-24 text-wa-muted">{label}</span>
                  <input type="range" min={lo} max={hi} step="0.02" value={it[key]} onChange={(e) => patch(safeCur, { [key]: Number(e.target.value) })} className="flex-1 accent-[#21C063]" />
                </label>
              ))}
              <button onClick={() => patch(safeCur, { b: 1, c: 1 })} className="text-[13px] text-[#21C063] font-medium">Reset</button>
            </div>
          )}
          {tool === "text" && (
            <div className="px-4 pb-3 shrink-0 space-y-2.5">
              <input value={it.text} onChange={(e) => patch(safeCur, { text: e.target.value.slice(0, 120) })} placeholder="Type text for this photo…" className="w-full h-11 rounded-xl bg-wa-field px-3.5 text-[15px] outline-none placeholder:text-wa-muted" />
              <div className="flex items-center gap-2.5">
                {TEXT_COLORS.map((c) => <button key={c} onClick={() => patch(safeCur, { tcolor: c })} aria-label={`Colour ${c}`} style={{ background: c }} className={`size-8 rounded-full border border-white/30 ${it.tcolor === c ? "ring-2 ring-offset-2 ring-offset-wa-bg ring-[#21C063]" : ""}`} />)}
              </div>
              <div className="flex items-center gap-2">
                {TEXT_POS.map(([id, label]) => <button key={id} onClick={() => patch(safeCur, { tpos: id })} className={`h-9 px-3.5 rounded-full text-[13px] ${it.tpos === id ? "bg-[#21C063] text-black font-semibold" : "bg-wa-field"}`}>{label}</button>)}
                <span className="w-2" />
                {TEXT_SIZES.map(([label, k]) => <button key={label} onClick={() => patch(safeCur, { tsize: k })} className={`size-9 rounded-full text-[13px] ${it.tsize === k ? "bg-[#21C063] text-black font-semibold" : "bg-wa-field"}`}>{label}</button>)}
              </div>
            </div>
          )}
          {tool === "ratio" && (
            <div className="flex justify-center gap-2.5 px-4 pb-3 shrink-0">
              {RATIOS.map((r) => (
                <button key={r.id} onClick={() => patch(safeCur, { ratio: r.id })} className={`h-10 px-5 rounded-full text-[14px] ${it.ratio === r.id ? "bg-[#21C063] text-black font-semibold" : "bg-wa-field"}`}>{r.label}</button>
              ))}
            </div>
          )}

          <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-3 pb-2.5 shrink-0">
            {[
              { id: "audio", icon: Music, label: "Audio", run: () => setShowMusic(true) },
              { id: "text", icon: Type, label: "Text" },
              ...(canBake ? [{ id: "filter", icon: Palette, label: "Filter" }, { id: "edit", icon: SlidersHorizontal, label: "Edit" }] : []),
              { id: "ratio", icon: Crop, label: "Ratio" },
            ].map((t) => (
              <button key={t.id} onClick={t.run || (() => setTool((c) => (c === t.id ? null : t.id)))} className={`shrink-0 w-[84px] h-[64px] rounded-2xl flex flex-col items-center justify-center gap-1 text-[13px] active:scale-95 transition-transform ${tool === t.id ? "bg-[#21C063]/25 text-[#21C063]" : "bg-wa-field"}`}>
                <t.icon size={22} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] shrink-0">
            <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
              {items.map((x, i) => (
                <button key={x.id} onClick={() => goSlide(i)} className={`relative shrink-0 size-14 rounded-xl overflow-hidden ${i === safeCur ? "ring-2 ring-white" : "opacity-70"}`}>
                  <img src={x.thumb} alt="" style={{ filter: cssFilter(x) }} className="w-full h-full object-cover" />
                </button>
              ))}
              {items.length < MAX && (
                <button onClick={() => gallery.current?.click()} disabled={!!prep} aria-label="Add more photos" className="shrink-0 size-14 rounded-xl bg-wa-field flex items-center justify-center disabled:opacity-40">{prep ? <Loader2 size={18} className="animate-spin" /> : <Plus size={22} />}</button>
              )}
            </div>
            <button onClick={() => setStep("details")} className="shrink-0 h-12 px-8 rounded-full bg-[#21C063] text-black font-semibold text-[16px] active:scale-95">Next</button>
          </div>
        </>
      )}

      {/* ───────── 3. DETAILS ───────── */}
      {step === "details" && (
        <>
          {header("New post")}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4">
              {items.map((x) => (
                <div key={x.id} className="shrink-0 snap-start rounded-xl overflow-hidden bg-black/40">
                  <Shot it={x} box={{ w: 9999, h: 250 }} />
                </div>
              ))}
            </div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={3} placeholder="Add a caption…" className="mt-5 w-full bg-transparent text-[18px] placeholder:text-wa-muted outline-none resize-none" />
            <button onClick={() => setShowMusic(true)} className="mt-3 w-full flex items-center gap-4 h-14 text-left active:opacity-70">
              <Music size={26} />
              <span className="flex-1 text-[18px] truncate">{song ? song.name : "Add audio"}</span>
              {song && <X size={18} className="text-wa-muted" onClick={(e) => { e.stopPropagation(); setSong(null); }} />}
              <ChevronRight size={22} className="text-wa-muted" />
            </button>
            <button onClick={() => setShowAudience(true)} className="mt-1 w-full flex items-center gap-4 h-14 text-left active:opacity-70">
              <Eye size={26} />
              <span className="flex-1 text-[18px]">Who can see this</span>
              <span className="text-[14px] text-wa-muted">{audienceLabel(audience || { mode: "all", users: [] })}</span>
              <ChevronRight size={22} className="text-wa-muted" />
            </button>
            <textarea value={lines} onChange={(e) => setLines(e.target.value)} maxLength={300} rows={3} placeholder="Lines to show with the song (lyrics, a quote…)" className="mt-2 w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] placeholder:text-wa-muted outline-none resize-none" />
            {busy && <div className="mt-4 flex items-center gap-2 text-[13.5px] text-wa-muted"><Loader2 size={15} className="animate-spin" /> {stage}</div>}
          </div>
          <div className="px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] border-t border-white/5 shrink-0">
            <button onClick={share} disabled={busy || !items.length} className="w-full h-14 rounded-full bg-[#21C063] text-black font-semibold text-[18px] active:scale-[.98] disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <><Loader2 size={20} className="animate-spin" /> Sharing…</> : "Share"}
            </button>
          </div>
        </>
      )}

      <input
        ref={songInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 4 * 1024 * 1024) return toast.error("Pick a song under 4 MB");
          setSong({ data: await readFileAsBase64(file), name: file.name.replace(/\.[^.]+$/, ""), size: file.size, mime: file.type });
          setShowMusic(false);
        }}
      />
      {showAudience && (
        <div className="fixed inset-0 z-[95]">
          <StatusAudienceSheet noun="post" value={audience || { mode: "all", users: [] }} onClose={() => setShowAudience(false)} onSave={(a) => { setAudience(a); setShowAudience(false); }} />
        </div>
      )}
      {showMusic && (
        <StatusMusicSheet
          onClose={() => setShowMusic(false)}
          onPick={(sg) => {
            setSong(sg);
            setShowMusic(false);
          }}
          onFiles={() => songInput.current?.click()}
        />
      )}
    </div>
  );
};

export default NewPost;
