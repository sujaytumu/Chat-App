import { useState, useRef, useEffect } from "react";
import { Play, Pause, ArrowLeft, Download, Forward, Send } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

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


const SPEEDS = [1, 1.5, 2, 0.5];

const whenLabel = (d) => {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t)) return "";
  const hm = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `Today, ${hm}`;
  if (days === 1) return `Yesterday, ${hm}`;
  return `${t.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}, ${hm}`;
};

// Full-screen viewer in WhatsApp's layout: back arrow with name and time, download/forward on the top bar,
// a big round play/pause in the middle, and a green seek bar with times and speed at the bottom.
const VideoViewer = ({ file, poster, title, sentAt, onForward, onClose, message }) => {
  const [reply, setReply] = useState("");
  const sendReply = async (e) => {
    e?.preventDefault();
    const t = reply.trim();
    if (!t || !message) return;
    setReply("");
    onClose();
    useChatStore.getState().setReplyingTo(message);
    try { await useChatStore.getState().sendMessage({ text: t }); } catch { /* toast shown by store */ }
  };
  const react = (emoji) => {
    if (!message?._id) return;
    useChatStore.getState().reactToMessage(message._id, emoji);
    onClose();
  };
  const vref = useRef(null);
  const hideT = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(Number(file.duration) || 0);
  const [rate, setRate] = useState(1);
  const [chrome, setChrome] = useState(true);

  const poke = (on = true) => {
    clearTimeout(hideT.current);
    setChrome(true);
    if (on) hideT.current = setTimeout(() => setChrome(false), 2800);
  };
  useEffect(() => () => clearTimeout(hideT.current), []);

  const toggle = () => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (vref.current) vref.current.playbackRate = next;
  };

  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[130] bg-black select-none" onClick={() => (playing ? (chrome ? setChrome(false) : poke()) : toggle())}>
      <video
        ref={vref}
        src={file.url}
        poster={poster}
        autoPlay
        playsInline
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlay={(e) => {
          e.currentTarget.playbackRate = rate;
          setPlaying(true);
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          poke(false);
        }}
        onEnded={() => {
          setPlaying(false);
          poke(false);
        }}
        className="absolute inset-x-0 top-0 bottom-[72px] size-full object-contain" style={{ height: "calc(100% - 72px)" }}
      />

      <div className={`absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent pt-[env(safe-area-inset-top)] transition-opacity duration-200 ${chrome ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 px-2 py-2.5 text-white">
          <button onClick={onClose} aria-label="Back" className="size-11 rounded-full flex items-center justify-center active:bg-white/10"><ArrowLeft size={24} /></button>
          <div className="min-w-0 flex-1 pl-1 leading-tight">
            <p className="truncate text-[17px] font-medium">{title || "Video"}</p>
            {sentAt && <p className="truncate text-[13px] text-white/75">{whenLabel(sentAt)}</p>}
          </div>
          <a href={file.url} download target="_blank" rel="noreferrer" aria-label="Download" className="size-11 rounded-full flex items-center justify-center active:bg-white/10"><Download size={22} /></a>
          {onForward && (
            <button onClick={() => { onClose(); onForward(); }} aria-label="Forward" className="size-11 rounded-full flex items-center justify-center active:bg-white/10"><Forward size={22} /></button>
          )}
        </div>
      </div>

      <div className={`absolute inset-x-0 top-0 bottom-[72px] flex items-center justify-center pointer-events-none transition-opacity duration-200 ${chrome || !playing ? "opacity-100" : "opacity-0"}`}>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="pointer-events-auto size-[76px] rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition-transform"
        >
          {playing ? <Pause size={34} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
        </button>
      </div>

      <div className={`absolute inset-x-0 bottom-[72px] bg-gradient-to-t from-black/70 to-transparent pb-3 pt-10 transition-opacity duration-200 ${chrome || !playing ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 text-white text-[14px] tabular-nums">
          <span className="w-11">{fmt(cur)}</span>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step="0.05"
            value={Math.min(cur, dur || 0)}
            onChange={(e) => { const t = Number(e.target.value); setCur(t); if (vref.current) vref.current.currentTime = t; poke(playing); }}
            aria-label="Seek"
            className="flex-1 h-1 appearance-none rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#25D366] [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#25D366]"
            style={{ background: `linear-gradient(to right,#25D366 ${pct}%,rgba(255,255,255,.35) ${pct}%)` }}
          />
          <span className="w-11 text-right">{fmt(dur)}</span>
          <button type="button" onClick={cycleSpeed} aria-label="Playback speed" className="w-10 text-right font-medium">{rate}x</button>
        </div>
      </div>

      {message && (
        <form onSubmit={sendReply} onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 h-[72px] bg-black px-3 pb-[env(safe-area-inset-bottom)] flex items-center">
          <div className="flex w-full items-center rounded-full bg-[#202c33] pl-5 pr-2 h-[52px]">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => vref.current?.pause()}
              placeholder="Reply"
              className="min-w-0 flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none"
            />
            {reply.trim() ? (
              <button type="submit" aria-label="Send reply" className="size-10 rounded-full bg-[#25D366] flex items-center justify-center text-white"><Send size={19} /></button>
            ) : (
              <>
                <button type="button" onClick={() => react("❤️")} aria-label="React with heart" className="size-10 text-[26px] leading-none active:scale-90 transition-transform">❤️</button>
                <button type="button" onClick={() => react("🙏")} aria-label="React with folded hands" className="size-10 text-[26px] leading-none active:scale-90 transition-transform">🙏</button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

// A video in the chat, like WhatsApp: a picture of the video with a play button, the length and HD badge at the
// bottom left, and the time and ticks laid over the bottom right. Tap to watch it full screen.
const ChatVideo = ({ file, onError, onLoadedMetadata, overlay, title, sentAt, onForward, message }) => {
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
        className="relative w-[182px] max-w-full overflow-hidden rounded-[15px] bg-black cursor-pointer select-none"
        style={{ aspectRatio: String(ratio) }}
      >
        <video
          src={`${file.url}#t=0.1`}
          poster={poster}
          preload="auto"
          muted
          playsInline
          tabIndex={-1}
          onError={onError}
          onLoadedData={(e) => {
            // some Android WebViews leave the video black until it is nudged to a real frame
            const v = e.currentTarget;
            if (v.paused && v.currentTime < 0.05) { try { v.currentTime = 0.1; } catch { /* ignore */ } }
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setMeta((m) => ({ w: v.videoWidth || m.w, h: v.videoHeight || m.h, d: Number.isFinite(v.duration) ? v.duration : m.d }));
            onLoadedMetadata?.(e);
          }}
          className="absolute inset-0 size-full object-cover pointer-events-none"
        />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="size-[40px] rounded-full bg-black/35 flex items-center justify-center">
            <Play size={20} className="text-white ml-0.5" fill="currentColor" />
          </span>
        </div>
        <div className="absolute left-2 bottom-1.5 flex items-center gap-1.5 text-white text-[11.5px] font-semibold leading-none pointer-events-none">
          {hd && <span className="rounded-[3px] bg-white px-1 py-[2px] text-[10px] font-extrabold tracking-wide text-black">HD</span>}
          {meta.d > 0 && <span className="tabular-nums drop-shadow">{fmt(meta.d)}</span>}
        </div>
        {overlay && <div className="absolute right-2 bottom-1.5 flex items-center gap-1 text-white text-[11px] leading-none pointer-events-none">{overlay}</div>}
      </div>

      {open && <VideoViewer file={file} poster={poster} title={title} sentAt={sentAt} onForward={onForward} message={message} onClose={() => setOpen(false)} />}
    </>
  );
};

export default ChatVideo;
