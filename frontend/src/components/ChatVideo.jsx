import { useState } from "react";
import { Play, X, Download } from "lucide-react";
import SpeedVideo from "./SpeedVideo";

const fmt = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Cloudinary can hand back a still picture of the first frame: instant thumbnail, no video download needed.
const posterFor = (url) => {
  if (!/res\.cloudinary\.com\/.+\/video\/upload\//.test(url || "")) return undefined;
  return url.replace("/video/upload/", "/video/upload/so_0,w_520,c_limit,f_jpg,q_auto/").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
};

// A video in the chat, like WhatsApp: a picture of the video with a play button, the length and HD badge at the
// bottom left, and the time and ticks laid over the bottom right. Tap to watch it full screen.
const ChatVideo = ({ file, onError, onLoadedMetadata, overlay }) => {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState({ w: 0, h: 0, d: Number(file.duration) || 0 });
  const poster = posterFor(file.url);

  // keep the card in the video's own shape (tall, wide or square) within sensible limits
  const ratio = meta.w && meta.h ? Math.min(1.45, Math.max(0.62, meta.w / meta.h)) : 0.75;
  const hd = Math.max(meta.w, meta.h) >= 1280;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Play video"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        className="relative w-[260px] max-w-full overflow-hidden rounded-[15px] bg-black cursor-pointer select-none"
        style={{ aspectRatio: String(ratio) }}
      >
        <video
          src={`${file.url}#t=0.1`}
          poster={poster}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          onError={onError}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setMeta((m) => ({ w: v.videoWidth || m.w, h: v.videoHeight || m.h, d: Number.isFinite(v.duration) ? v.duration : m.d }));
            onLoadedMetadata?.(e);
          }}
          className="absolute inset-0 size-full object-cover pointer-events-none"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="size-[52px] rounded-full bg-black/45 backdrop-blur-[2px] flex items-center justify-center">
            <Play size={26} className="text-white ml-0.5" fill="currentColor" />
          </span>
        </div>
        <div className="absolute left-2 bottom-1.5 flex items-center gap-1.5 text-white text-[12.5px] font-semibold leading-none pointer-events-none">
          {hd && <span className="rounded-[3px] bg-white px-1 py-[2px] text-[10px] font-extrabold tracking-wide text-black">HD</span>}
          {meta.d > 0 && <span className="tabular-nums drop-shadow">{fmt(meta.d)}</span>}
        </div>
        {overlay && <div className="absolute right-2 bottom-1.5 flex items-center gap-1 text-white text-[11px] leading-none pointer-events-none">{overlay}</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col" onClick={() => setOpen(false)}>
          <div className="shrink-0 flex items-center justify-between px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} aria-label="Close" className="size-10 rounded-full flex items-center justify-center text-white active:bg-white/10">
              <X size={24} />
            </button>
            <a href={file.url} download target="_blank" rel="noreferrer" aria-label="Download" className="size-10 rounded-full flex items-center justify-center text-white active:bg-white/10">
              <Download size={22} />
            </a>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <SpeedVideo wrapperClassName="max-w-full max-h-full" src={file.url} poster={poster} controls autoPlay playsInline className="max-w-full max-h-[calc(100dvh-72px)]" />
          </div>
        </div>
      )}
    </>
  );
};

export default ChatVideo;
