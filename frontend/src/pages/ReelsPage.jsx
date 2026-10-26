import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FeedView, { NewPost } from "../components/FeedView";
import { Heart, MessageCircle, Send, Plus, Volume2, VolumeX, Trash2, Loader2, X, Film, Play, Music, Bookmark, AlignJustify, ChevronDown, House, CircleDashed, Phone, Link2, Check, Repeat2, Search, ChevronLeft, BarChart3, EyeOff, Flag, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useAuthStore } from "../store/useAuthStore";
import StatusComments from "../components/StatusComments";
import SendReelModal from "../components/SendReelModal";
import StatusMusicSheet from "../components/StatusMusicSheet";
import { SongBars } from "../components/StatusSong";
import { ReelHeart, ReelComment, ReelRepost, ReelSend, ReelSave, ReelMenu } from "../components/icons/ReelIcons";
import { readFileAsBase64 } from "../lib/fileUtils";

// Reels: short vertical videos from people you can see — swipe up for the next one, double-tap to like,
// comments, share, and your own post button. Same privacy rule as chats ("who can see whom").

// Looks: pure CSS filters applied while playing, so the original video is never re-encoded.
export const FILTERS = [
  { id: "none", name: "Original", css: "none" },
  { id: "warm", name: "Warm", css: "sepia(.25) saturate(1.3) hue-rotate(-10deg) brightness(1.05)" },
  { id: "cool", name: "Cool", css: "saturate(1.1) hue-rotate(15deg) brightness(1.03) contrast(1.05)" },
  { id: "mono", name: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "vivid", name: "Vivid", css: "saturate(1.7) contrast(1.1)" },
  { id: "fade", name: "Fade", css: "contrast(.85) brightness(1.1) saturate(.8)" },
  { id: "vintage", name: "Vintage", css: "sepia(.55) contrast(.95) brightness(1.05) saturate(.9)" },
  { id: "dream", name: "Dream", css: "brightness(1.1) saturate(1.25) contrast(.92) blur(.4px)" },
];
const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css || "none";

const MAX_MB = 50;
const MAX_TOTAL_MB = 54; // video + song together (they travel in one request)
const MAX_SECONDS = 180;
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

const Rail = ({ icon: Icon, label, onClick, active, fill, size = 30 }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.6)] active:scale-90 transition-transform">
    <Icon size={size} className={active ? "text-[#ff3040]" : ""} fill={fill ? "currentColor" : "none"} strokeWidth={2} />
    {label !== undefined && <span className="text-[13px] font-semibold tabular-nums leading-none">{label}</span>}
  </button>
);

// A curated Instagram reel shown with Instagram's official embed (plays with sound after you tap it).
const InstaReel = ({ reel, active, near }) => (
  <section className="h-full w-full snap-start snap-always relative bg-black flex items-center justify-center overflow-hidden pt-14 pb-1" data-reel={reel._id}>
    {active || near ? (
      <iframe
        title="Instagram reel"
        src={`https://www.instagram.com/${reel.igPath}/${reel.igCode}/embed/`}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        scrolling="no"
        className="h-full w-full max-w-[460px] border-0 bg-black"
      />
    ) : (
      <span className="text-white/40 text-sm">Instagram reel</span>
    )}
  </section>
);

const ReelItem = ({ reel, active, muted, setMuted, onLike, onComments, onShare, onSave, onFollow, onMenu, onRepost, onNext, near, onTag, onUser }) => {
  const video = useRef(null);
  const songEl = useRef(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const fillEl = useRef(null);
  const dotEl = useRef(null);
  const setProg = (f) => {
    if (fillEl.current) fillEl.current.style.transform = `scaleX(${f})`;
    if (dotEl.current) dotEl.current.style.left = `${f * 100}%`;
  };
  const [rate, setRateState] = useState(() => { try { return Number(localStorage.getItem("reelRate")) || 1; } catch { return 1; } });
  const [rateOpen, setRateOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [scrub, setScrub] = useState(false);
  const [fast, setFast] = useState(false); // holding the screen = 2x speed
  const holdTimer = useRef(null);
  const heldRef = useRef(false);
  const bar = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      setPaused(false);
      v.currentTime = reel.trim?.start || 0;
      v.muted = muted;
      try { const r = Number(localStorage.getItem("reelRate")) || 1; setRateState(r); v.playbackRate = r; if (songEl.current) songEl.current.playbackRate = r; } catch { /* ignore */ }
      if (songEl.current) {
        songEl.current.currentTime = reel.song?.start || 0;
        songEl.current.play().catch(() => {});
      }
      v.play().catch(() => {
        // sound blocked until a tap: start muted so it still plays
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
      if (reel.source === "reel" || !reel.source) axiosInstance.put(`/reels/${reel._id}/view`).catch(() => {});
      else if (reel.source === "status") axiosInstance.put(`/status/${reel._id}/view`).catch(() => {});
    } else {
      v.pause();
      songEl.current?.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reel._id]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
    if (songEl.current) songEl.current.muted = muted;
  }, [muted]);

  // the trimmed part loops (the file itself is whole)
  const onTime = (e) => {
    const v = e.currentTarget;
    const start = reel.trim?.start || 0;
    const end = reel.trim?.end || v.duration || 0;
    if (reel.trim && v.currentTime >= end - 0.05 && !scrub) {
      finished();
      return;
    }
  };

  // smooth progress bar: follows the video every frame without re-rendering the reel
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const tick = () => {
      const v = video.current;
      if (v && !scrub) {
        const start = reel.trim?.start || 0;
        const end = reel.trim?.end || v.duration || 0;
        if (end > start) setProg(Math.min(1, Math.max(0, (v.currentTime - start) / (end - start))));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scrub, reel._id]);

  // Played to the end: go to the next reel by itself (the last one starts over).
  const finished = () => {
    const v = video.current;
    if (!v || !active) return;
    if (onNext && onNext(reel._id)) return;
    v.currentTime = reel.trim?.start || 0;
    if (songEl.current) songEl.current.currentTime = reel.song?.start || 0;
    v.play().catch(() => {});
  };

  // Drag the bar to jump to any moment.
  const seekTo = (clientX) => {
    const v = video.current;
    const r = bar.current?.getBoundingClientRect();
    if (!v || !r) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const start = reel.trim?.start || 0;
    const end = reel.trim?.end || v.duration || 0;
    if (!(end > start)) return;
    const t = start + f * (end - start);
    v.currentTime = Math.min(t, Math.max(start, end - 0.1));
    if (songEl.current && reel.song) songEl.current.currentTime = (reel.song.start || 0) + (t - start);
    setProg(f);
  };
  const scrubDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setScrub(true);
    seekTo(e.clientX);
  };
  const scrubMove = (e) => {
    if (scrub) seekTo(e.clientX);
  };
  const scrubUp = () => setScrub(false);

  const setRate = (r) => {
    if (video.current) video.current.playbackRate = r;
    if (songEl.current) songEl.current.playbackRate = r;
  };
  const chooseRate = (r) => {
    setRateState(r);
    setRate(r);
    setRateOpen(false);
    try { localStorage.setItem("reelRate", String(r)); } catch { /* ignore */ }
  };
  const holdStart = () => {
    heldRef.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setRate(2);
      setFast(true);
    }, 350);
  };
  const holdEnd = () => {
    clearTimeout(holdTimer.current);
    if (heldRef.current) {
      setRate(rate);
      setFast(false);
      setTimeout(() => (heldRef.current = false), 60); // swallow the click that follows a hold
    }
  };

  const tap = () => {
    if (heldRef.current) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!reel.liked) onLike(reel, true);
      setBurst((b) => b + 1);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      const v = video.current;
      if (!v) return;
      if (v.paused) {
        v.play().catch(() => {});
        songEl.current?.play().catch(() => {});
        setPaused(false);
      } else {
        v.pause();
        songEl.current?.pause();
        setPaused(true);
      }
    }, 280);
  };

  return (
    <section className="h-full w-full snap-start snap-always relative bg-black flex items-center justify-center overflow-hidden" style={{ contain: "layout paint" }} data-reel={reel._id}>
      <video
        ref={video}
        src={reel.videoUrl}
        poster={reel.poster}
        playsInline
        preload={active || near ? "auto" : "metadata"}
        onTimeUpdate={onTime}
        onEnded={finished}
        onLoadedMetadata={(e) => { if (reel.trim?.start) e.currentTarget.currentTime = reel.trim.start; }}
        style={{ filter: filterCss(reel.filter) }}
        className="absolute inset-0 w-full h-full object-contain"
      />
      {reel.song?.url && <audio ref={songEl} src={reel.song.url} loop preload={active ? "auto" : "none"} />}
      <div className="absolute inset-0 touch-pan-y select-none" onClick={tap} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()} />
      {fast && (
        <div className="absolute top-16 inset-x-0 flex justify-center pointer-events-none z-10">
          <span className="px-3 py-1 rounded-full bg-black/55 text-white text-[13px] font-semibold">2× speed</span>
        </div>
      )}
      <div className="absolute z-20 right-3 top-[calc(64px+env(safe-area-inset-top))] flex flex-col items-end gap-1.5">
        <button onClick={() => setRateOpen((o) => !o)} className="min-w-[44px] h-8 px-2.5 rounded-full bg-black/45 text-white text-[13px] font-bold tabular-nums active:scale-95 transition-transform" aria-label="Playback speed">{rate}×</button>
        {rateOpen && (
          <div className="flex flex-col rounded-2xl bg-black/75 py-1 wa-pop-in">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <button key={r} onClick={() => chooseRate(r)} className={`px-4 py-1.5 text-[14px] tabular-nums text-left ${r === rate ? "text-[#25D366] font-bold" : "text-white"}`}>{r}×</button>
            ))}
          </div>
        )}
      </div>
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="size-20 rounded-full bg-black/40 flex items-center justify-center text-white">
            <Play size={38} fill="currentColor" />
          </span>
        </div>
      )}
      {burst > 0 && (
        <div key={burst} className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart size={110} className="text-white drop-shadow-lg" fill="#ff3040" strokeWidth={0} style={{ animation: "reelHeart .8s ease-out forwards" }} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />

      <div className="absolute right-3 bottom-8 flex flex-col items-center gap-[22px] z-10">
        <Rail icon={ReelHeart} size={31} label={count(reel.likeCount)} active={reel.liked} fill={reel.liked} onClick={() => onLike(reel, !reel.liked)} />
        <Rail icon={ReelComment} size={29} label={count(reel.comments)} onClick={() => onComments(reel)} />
        <Rail icon={ReelRepost} size={30} label={count(reel.reposts)} active={reel.reposted} onClick={() => onRepost(reel)} />
        <Rail icon={ReelSend} size={28} label={count(reel.views)} onClick={() => onShare(reel)} />
        <Rail icon={ReelSave} size={28} label={count(reel.saves)} fill={reel.saved} onClick={() => onSave(reel)} />
        <Rail icon={ReelMenu} size={27} onClick={() => onMenu(reel)} />
      </div>

      <div className="absolute left-4 right-[72px] bottom-6 text-white z-10">
        {reel.repostedBy && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-white/85"><Repeat2 size={14} /> {reel.repostedBy.fullName} reposted</p>
        )}
        <div className="flex items-center gap-2.5">
          <button onClick={() => !reel.external && onUser(reel.user)} className="flex items-center gap-2.5 min-w-0">
            <img src={optimizeImage(reel.user?.profilePic || "/avatar.png", 96)} alt="" className="size-10 rounded-full object-cover border border-white/30 bg-neutral-800" />
            <span className="font-semibold text-[15.5px] drop-shadow truncate max-w-[40vw]">{reel.user?.fullName}</span>
          </button>
          {!reel.mine && !reel.external && reel.source !== "discover" && (
            <button
              onClick={() => onFollow(reel)}
              className={`ml-1 px-3.5 py-1 rounded-lg border text-[14px] font-semibold ${reel.following ? "border-white/40 text-white/80" : "border-white text-white"}`}
            >
              {reel.following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {reel.song?.url ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/95"><Music size={13} /> <span className="truncate">{reel.song.name || "Original audio"}</span></p>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/80"><Music size={13} /> <span className="truncate">Original audio · {reel.user?.fullName}</span></p>
        )}
        {reel.caption && (
          <p onClick={() => setMore((m) => !m)} className={`mt-1.5 text-[14.5px] leading-snug drop-shadow whitespace-pre-wrap break-words ${more ? "max-h-40 overflow-y-auto" : "line-clamp-1"}`}>
            {reel.caption.split(/(#[\p{L}\p{M}\p{N}_]{2,30})/gu).map((part, i) =>
              part.startsWith("#") && part.length > 2 ? (
                <button key={i} onClick={(e) => { e.stopPropagation(); onTag(part.slice(1).toLowerCase()); }} className="font-semibold text-white underline-offset-2 active:underline">{part}</button>
              ) : (
                part
              )
            )}
          </p>
        )}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-7 z-20 flex items-end touch-none"
        onPointerDown={scrubDown}
        onPointerMove={scrubMove}
        onPointerUp={scrubUp}
        onPointerCancel={scrubUp}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={bar} className={`relative w-full bg-white/25 transition-[height] ${scrub ? "h-[7px]" : "h-[3px]"}`}>
          <div ref={fillEl} className="h-full w-full bg-white origin-left will-change-transform" style={{ transform: "scaleX(0)" }} />
          <span ref={dotEl} className={`absolute top-1/2 size-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow transition-opacity ${scrub ? "opacity-100" : "opacity-0"}`} style={{ left: 0 }} />
        </div>
      </div>
    </section>
  );
};

const NewReel = ({ onClose, onPosted }) => {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [caption, setCaption] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("none");
  const [range, setRange] = useState([0, 0]); // trim start / end in seconds (end 0 = untouched)
  const [song, setSong] = useState(null); // { data, name, size, mime }
  const [showMusic, setShowMusic] = useState(false);
  const pick = useRef(null);
  const prev = useRef(null);
  const songInput = useRef(null);
  const trimmed = duration > 0 && (range[0] > 0.05 || (range[1] > 0 && range[1] < duration - 0.05));
  const effEnd = range[1] > 0 ? range[1] : duration;
  const effLen = Math.max(0, effEnd - range[0]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const choose = (f) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Pick a video");
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`Keep the video under ${MAX_MB} MB`);
    setFile(f);
    setRange([0, 0]);
    setUrl(URL.createObjectURL(f));
  };

  const post = async () => {
    if (!file || busy) return;
    if ((trimmed ? effLen : duration) > MAX_SECONDS + 0.5) return toast.error(`Reels can be at most ${MAX_SECONDS} seconds — trim it shorter`);
    if (song && (file.size + song.size) / 1048576 > MAX_TOTAL_MB) return toast.error("Video + song are too big together — pick a shorter video or another song");
    setBusy(true);
    try {
      const data = await new Promise((ok, bad) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = bad;
        r.readAsDataURL(file);
      });
      const res = await axiosInstance.post("/reels", { video: data, caption, duration, filter, ...(trimmed ? { trim: { start: range[0], end: effEnd } } : {}), ...(song ? { song: { data: song.data, name: song.name, mime: song.mime, size: song.size, start: 0 } } : {}) }, { timeout: 600000, onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
      toast.success("Reel posted");
      onPosted(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't post the reel");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} disabled={busy} className="size-10 rounded-full bg-white/10 flex items-center justify-center"><X size={20} /></button>
        <h3 className="font-semibold">New reel</h3>
        <button onClick={post} disabled={!file || busy} className="px-4 py-2 rounded-full bg-[#25D366] text-black text-sm font-semibold disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Share"}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        {url ? (
          <video
            ref={prev}
            src={url}
            playsInline
            muted
            loop
            autoPlay
            onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.currentTime >= effEnd - 0.05 || v.currentTime < range[0] - 0.3) v.currentTime = range[0];
            }}
            style={{ filter: filterCss(filter) }}
            className="max-h-full max-w-full rounded-xl"
          />
        ) : (
          <button onClick={() => pick.current?.click()} className="flex flex-col items-center gap-3 text-white/80">
            <span className="size-20 rounded-full bg-white/10 flex items-center justify-center"><Film size={34} /></span>
            <span className="text-[15px]">Choose a video (up to {MAX_SECONDS}s, {MAX_MB} MB)</span>
          </button>
        )}
        <input ref={pick} type="file" accept="video/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] space-y-2">
        {busy && (
          <div className="h-1.5 rounded-full bg-white/20 overflow-hidden"><div className="h-full bg-[#25D366] transition-all" style={{ width: `${pct}%` }} /></div>
        )}
        {file && !busy && (
          <>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} className="shrink-0 flex flex-col items-center gap-1">
                  <span className={`block size-14 rounded-xl overflow-hidden border-2 ${filter === f.id ? "border-[#25D366]" : "border-transparent"}`}>
                    <video src={url} muted playsInline preload="metadata" style={{ filter: f.css }} className="size-full object-cover pointer-events-none" />
                  </span>
                  <span className={`text-[11px] ${filter === f.id ? "text-[#25D366]" : "text-white/70"}`}>{f.name}</span>
                </button>
              ))}
            </div>
            {duration > 1 && (
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <div className="flex justify-between text-[12px] text-white/70 mb-1">
                  <span>Trim</span>
                  <span className="tabular-nums">{range[0].toFixed(1)}s – {effEnd.toFixed(1)}s ({effLen.toFixed(1)}s)</span>
                </div>
                <input type="range" min={0} max={duration} step={0.1} value={range[0]} onChange={(e) => setRange(([, b]) => [Math.min(+e.target.value, (b || duration) - 0.5), b])} className="w-full accent-[#25D366]" aria-label="Start" />
                <input type="range" min={0} max={duration} step={0.1} value={effEnd} onChange={(e) => setRange(([a]) => [a, Math.max(+e.target.value, a + 0.5)])} className="w-full accent-[#25D366]" aria-label="End" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMusic(true)} className="flex-1 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-[14px]">
                <Music size={17} className={song ? "text-[#25D366]" : ""} /> <span className="truncate">{song ? song.name : "Add music"}</span>
              </button>
              {song && <button onClick={() => setSong(null)} className="size-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Remove music"><X size={16} /></button>}
            </div>
          </>
        )}
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 300))}
          disabled={busy}
          placeholder="Write a caption…"
          className="w-full rounded-full bg-white/10 px-4 py-3 text-[15px] outline-none placeholder:text-white/50"
        />
        {file && !busy && <button onClick={() => pick.current?.click()} className="text-sm text-white/70 underline">Choose another video</button>}
      </div>
      <input
        ref={songInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 4 * 1024 * 1024) return toast.error("Pick a song under 4 MB");
          setSong({ data: await readFileAsBase64(file), name: file.name.replace(/\.[^.]+$/, ""), size: file.size, mime: file.type });
          setShowMusic(false);
        }}
      />
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

const REPORT_REASONS = [["spam", "Spam"], ["abuse", "Bullying or abuse"], ["inappropriate", "Inappropriate content"], ["scam", "Scam or fraud"], ["other", "Something else"]];

const Stat = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-3 flex flex-col items-center gap-1">
    <Icon size={20} className="text-white/80" />
    <span className="text-[20px] font-bold tabular-nums">{count(value)}</span>
    <span className="text-[12px] text-white/60">{label}</span>
  </div>
);

const Insights = ({ reel, onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => {
    axiosInstance.get(`/reels/${reel._id}/insights`).then((r) => setD(r.data)).catch(() => { toast.error("Couldn't load insights"); onClose(); });
  }, [reel._id, onClose]);
  const People = ({ title, list }) =>
    list?.length ? (
      <div className="mt-4">
        <p className="text-[13px] text-white/60 mb-2">{title}</p>
        <div className="flex flex-wrap gap-2">
          {list.map((u) => (
            <span key={u._id} className="flex items-center gap-1.5 rounded-full bg-white/10 pl-1 pr-3 py-1 text-[13px]">
              <img src={optimizeImage(u.profilePic || "/avatar.png", 64)} alt="" className="size-6 rounded-full object-cover" /> {u.fullName}
            </span>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full max-h-[80%] overflow-y-auto bg-neutral-900 rounded-t-3xl p-5 pb-8 text-white wa-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        <h3 className="text-[17px] font-semibold mb-3">Reel insights</h3>
        {!d ? (
          <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={Eye} label="Views" value={d.views} />
              <Stat icon={Heart} label="Likes" value={d.likes} />
              <Stat icon={MessageCircle} label="Comments" value={d.comments} />
              <Stat icon={Bookmark} label="Saves" value={d.saves} />
              <Stat icon={Repeat2} label="Reposts" value={d.reposts} />
              <Stat icon={BarChart3} label="Engagement" value={`${d.engagement}%`} />
            </div>
            <People title="Recently liked by" list={d.likedBy} />
            <People title="Reposted by" list={d.repostedBy} />
          </>
        )}
      </div>
    </div>
  );
};

const SearchReels = ({ onClose, onOpen, onTag }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [tags, setTags] = useState([]);
  const seq = useRef(0);
  useEffect(() => {
    axiosInstance.get("/reels/trending").then((r) => setTags(r.data.tags || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return setResults(null);
    const my = ++seq.current;
    const h = setTimeout(() => {
      axiosInstance.get("/reels/search", { params: { q: t } }).then((r) => my === seq.current && setResults(r.data.reels || [])).catch(() => my === seq.current && setResults([]));
    }, 300);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="absolute inset-0 z-[70] bg-black text-white flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} className="size-10 flex items-center justify-center" aria-label="Back"><ChevronLeft size={26} /></button>
        <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-full px-3 py-2.5">
          <Search size={17} className="text-white/60" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reels, #tags, people" className="bg-transparent outline-none flex-1 text-[15px] placeholder:text-white/50" />
          {q && <button onClick={() => setQ("")}><X size={16} className="text-white/60" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {results === null ? (
          <>
            <p className="text-[13px] text-white/60 mt-3 mb-2">Trending</p>
            {tags.length ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button key={t.tag} onClick={() => onTag(t.tag)} className="rounded-full bg-white/10 px-3.5 py-2 text-[14px] font-medium">#{t.tag} <span className="text-white/50 text-[12px]">{t.count}</span></button>
                ))}
              </div>
            ) : (
              <p className="text-white/50 text-[14px]">No trending tags yet — add #hashtags to your captions.</p>
            )}
          </>
        ) : !results.length ? (
          <p className="text-center text-white/50 mt-16">No reels found</p>
        ) : (
          <div className="grid grid-cols-3 gap-1 mt-2">
            {results.map((r) => (
              <button key={r._id} onClick={() => onOpen(r, q.trim())} className="relative aspect-[9/16] bg-neutral-800 overflow-hidden rounded-md">
                {r.poster && <img src={r.poster} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
                <span className="absolute left-1.5 bottom-1.5 flex items-center gap-1 text-[11px] font-semibold drop-shadow"><Play size={11} fill="currentColor" /> {count(r.views)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ReportsReview = ({ onClose, onRemoved }) => {
  const [list, setList] = useState(null);
  useEffect(() => {
    axiosInstance.get("/reels/admin/reports").then((r) => setList(r.data.reels || [])).catch(() => { toast.error("Couldn't load reports"); onClose(); });
  }, [onClose]);
  const act = async (r, kind) => {
    try {
      if (kind === "remove") {
        if (!window.confirm("Remove this reel for everyone?")) return;
        await axiosInstance.delete(`/reels/admin/${r._id}`);
        onRemoved(r._id);
      } else {
        await axiosInstance.put(`/reels/admin/${r._id}/dismiss`);
      }
      setList((l) => l.filter((x) => x._id !== r._id));
    } catch {
      toast.error("Couldn't do that");
    }
  };
  return (
    <div className="absolute inset-0 z-[70] bg-black text-white flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} className="size-10 flex items-center justify-center" aria-label="Back"><ChevronLeft size={26} /></button>
        <h3 className="text-[18px] font-semibold">Reported reels</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-3">
        {list === null ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : !list.length ? (
          <p className="text-center text-white/50 mt-20">No reports. All clear.</p>
        ) : (
          list.map((r) => (
            <div key={r._id} className="flex gap-3 rounded-2xl bg-white/10 p-3">
              <div className="w-20 aspect-[9/16] rounded-lg overflow-hidden bg-neutral-800 shrink-0">{r.poster && <img src={r.poster} alt="" className="w-full h-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{r.user?.fullName || "Unknown"}</p>
                <p className="text-[13px] text-white/70 line-clamp-2 break-words">{r.caption || "No caption"}</p>
                <p className="text-[12.5px] text-red-300 mt-1">{r.reports} report{r.reports > 1 ? "s" : ""}: {Object.entries(r.reasons).map(([k, n]) => `${k} ×${n}`).join(", ")}</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => act(r, "remove")} className="px-3.5 py-1.5 rounded-full bg-red-500 text-white text-[13px] font-semibold">Remove</button>
                  <button onClick={() => act(r, "dismiss")} className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-semibold">Keep</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ReelsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.authUser);
  const [mode, setMode] = useState("reels"); // feed | reels
  const [newPost, setNewPost] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const [tab, setTab] = useState("foryou"); // foryou | friends | saved
  const [reels, setReels] = useState([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sendFor, setSendFor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [pickTab, setPickTab] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(null); // { kind: tag | user | search, arg, label, startId } — a list outside the main tabs
  const [searching, setSearching] = useState(false);
  const [insightsFor, setInsightsFor] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reportFor, setReportFor] = useState(null);
  const box = useRef(null);
  const loadingMore = useRef(false);
  const cursor = useRef({ before: null, px: 1 });
  const gen = useRef(0);

  const load = useCallback(async (reset) => {
    if (loadingMore.current && !reset) return;
    loadingMore.current = true;
    const my = ++gen.current;
    try {
      const params = { tab };
      if (!reset) {
        if (cursor.current.before) params.before = cursor.current.before;
        params.px = cursor.current.px;
      }
      let url = "/reels";
      let cfg = { params, timeout: 20000 };
      if (view?.kind === "tag") { url = `/reels/tag/${encodeURIComponent(view.arg)}`; cfg = { timeout: 20000 }; }
      else if (view?.kind === "user") { url = `/reels/by-user/${view.arg}`; cfg = { timeout: 20000 }; }
      else if (view?.kind === "search") { url = "/reels/search"; cfg = { params: { q: view.arg }, timeout: 20000 }; }
      else if (tab === "saved") { url = "/reels/saved"; cfg = { timeout: 20000 }; }
      const { data } = await axiosInstance.get(url, cfg);
      if (my !== gen.current) return;
      if (typeof data.owner === "boolean") setIsOwner(data.owner);
      if (data.next) cursor.current.before = data.next;
      if (data.px) cursor.current.px = data.px;
      setReels((cur) => {
        const base = reset ? cur.filter((r) => r._pinned) : cur;
        const seen = new Set(base.map((r) => r._id));
        return [...base, ...data.reels.filter((r) => !seen.has(r._id))];
      });
      setMore(!!data.more);
      setFailed(false);
    } catch {
      // the server may be waking up / updating: say so, and let the person retry (never a spinner forever)
      if (my === gen.current) setFailed(true);
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, [tab, view]);

  // (re)load whenever the tab changes; a shared reel link is shown first
  useEffect(() => {
    cursor.current = { before: null, px: 1 };
    setLoading(true);
    setReels([]);
    setActiveId(null);
    box.current?.scrollTo({ top: 0 });
    (async () => {
      const wanted = tab === "foryou" && !view ? params.get("r") : null;
      if (wanted) {
        try {
          const { data } = await axiosInstance.get(`/reels/${wanted}`);
          setReels([{ ...data, source: "reel", _pinned: true }]);
        } catch {
          toast.error("This reel isn't available");
        }
      }
      load(true);
    })();
  }, [tab, view, params, load]);

  // the reel filling the screen is the one that plays
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.7) setActiveId(e.target.getAttribute("data-reel"));
      },
      { root, threshold: [0.7] }
    );
    root.querySelectorAll("[data-reel]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (!activeId || !more || tab === "saved" || view) return;
    const i = reels.findIndex((r) => r._id === activeId);
    if (i >= reels.length - 3 && reels.length) load(false);
  }, [activeId, reels, more, load, tab, view]);

  // opening a reel from search / a profile list: jump straight to it
  useEffect(() => {
    if (!view?.startId || !reels.length) return;
    const el = box.current?.querySelector(`[data-reel="${view.startId}"]`);
    if (el) {
      el.scrollIntoView({ block: "start" });
      setActiveId(view.startId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reels.length, view?.startId]);

  // Called when a reel finishes: slide to the next one. Returns false on the last reel so it can replay.
  const goNext = useCallback((id) => {
    const root = box.current;
    const cur = root?.querySelector(`[data-reel="${id}"]`);
    const next = cur?.nextElementSibling;
    if (!next || !next.hasAttribute("data-reel")) return false;
    next.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }, []);

  const activeIdx = Math.max(0, reels.findIndex((r) => r._id === (activeId || reels[0]?._id)));

  const patch = (id, fn) => setReels((l) => l.map((r) => (r._id === id ? { ...r, ...fn(r) } : r)));

  // A Discover clip becomes a real reel the first time you interact with it (like / comment / save / send / repost).
  const materialize = async (reel) => {
    if (reel.source !== "discover") return reel;
    try {
      const { data } = await axiosInstance.post("/reels/import", { clip: reel });
      const real = { ...data, source: "reel", following: false, _key: reel._key || reel._id };
      setReels((l) => l.map((r) => (r._id === reel._id ? real : r)));
      setActiveId((cur) => (cur === reel._id ? real._id : cur));
      return real;
    } catch {
      toast.error("Couldn't open that clip");
      return null;
    }
  };

  const like = async (item, liked) => {
    if (item.source === "discover") patch(item._id, (r) => ({ liked, likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)) }));
    const reel = await materialize(item);
    if (!reel) {
      if (item.source === "discover") patch(item._id, (r) => ({ liked: !liked, likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)) }));
      return;
    }
    if (item.source === "discover") patch(reel._id, () => ({ liked, likeCount: Math.max(0, (reel.likeCount || 0) + (liked ? 1 : 0)) }));
    else patch(reel._id, (r) => ({ liked, likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)) }));
    try {
      await axiosInstance.put(reel.source === "status" ? `/status/${reel._id}/like` : `/reels/${reel._id}/like`, { liked });
    } catch (err) {
      patch(reel._id, (r) => ({ liked: !liked, likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)) }));
      if (err.response?.data?.error) toast.error(err.response.data.error);
    }
  };

  const follow = async (reel) => {
    const want = !reel.following;
    const uid = reel.user?._id;
    setReels((l) => l.map((r) => (String(r.user?._id) === String(uid) ? { ...r, following: want } : r)));
    try {
      await axiosInstance.put(`/reels/follow/${uid}`, { follow: want });
      if (want) toast.success(`Following ${reel.user?.fullName}`);
    } catch {
      setReels((l) => l.map((r) => (String(r.user?._id) === String(uid) ? { ...r, following: !want } : r)));
    }
  };

  const save = async (item) => {
    const reel = await materialize(item);
    if (!reel) return;
    const want = !reel.saved;
    const key = reel.source === "status" ? `status:${reel._id}` : `reel:${reel._id}`;
    patch(reel._id, (r) => ({ saved: want, saves: Math.max(0, (r.saves || 0) + (want ? 1 : -1)) }));
    try {
      await axiosInstance.put("/reels/save", { key, saved: want });
      toast(want ? "Saved" : "Removed from saved", { icon: want ? "🔖" : "✖️" });
      if (!want && tab === "saved") setReels((l) => l.filter((r) => r._id !== reel._id));
    } catch (err) {
      patch(reel._id, (r) => ({ saved: !want, saves: Math.max(0, (r.saves || 0) + (want ? -1 : 1)) }));
      toast.error(err.response?.data?.error || "Couldn't save");
    }
  };

  // a video status needs a public copy (only when it is for everyone) before it can be sent or reposted
  const asReel = async (item) => {
    let reel = await materialize(item);
    if (!reel) return null;
    if (reel.source === "status") {
      const oldId = reel._id;
      try {
        const { data } = await axiosInstance.post(`/reels/import-status/${oldId}`);
        reel = { ...data, source: "reel", following: reel.following, _key: reel._key || oldId };
        setReels((l) => l.map((r) => (r._id === oldId ? reel : r)));
        setActiveId((cur) => (cur === oldId ? reel._id : cur));
      } catch (err) {
        toast.error(err.response?.data?.error || "Couldn't share that update");
        return null;
      }
    }
    return reel;
  };

  const shareReel = async (item) => {
    const reel = await asReel(item);
    if (reel) setSendFor(reel);
  };

  const repost = async (item) => {
    const reel = await asReel(item);
    if (!reel) return;
    if (reel.mine) return toast("That's your own reel", { icon: "🎬" });
    const want = !reel.reposted;
    patch(reel._id, (r) => ({ reposted: want, reposts: Math.max(0, (r.reposts || 0) + (want ? 1 : -1)) }));
    try {
      await axiosInstance.put(`/reels/${reel._id}/repost`, { reposted: want });
      toast(want ? "Reposted — people who can see you will get it" : "Repost removed", { icon: "🔁" });
    } catch (err) {
      patch(reel._id, (r) => ({ reposted: !want, reposts: Math.max(0, (r.reposts || 0) + (want ? -1 : 1)) }));
      toast.error(err.response?.data?.error || "Couldn't repost");
    }
  };

  const hide = async (reel, reason = "") => {
    setReels((l) => l.filter((r) => r._id !== reel._id));
    try {
      await axiosInstance.put(`/reels/${reel._id}/hide`, { reason });
      toast(reason ? "Thanks — we won't show it to you again" : "Okay, you'll see fewer like this", { icon: reason ? "🚩" : "🙈" });
    } catch {
      toast.error("Couldn't do that");
    }
  };

  const remove = async (reel) => {
    if (!window.confirm("Delete this reel?")) return;
    try {
      await axiosInstance.delete(`/reels/${reel._id}`);
      setReels((l) => l.filter((r) => r._id !== reel._id));
    } catch {
      toast.error("Couldn't delete");
    }
  };

  const copyLink = async (reel) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/reels?r=${reel._id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const tabBtn = (id, label) => (
    <button onClick={() => { setTab(id); setMode("reels"); }} className={`text-[18px] font-bold drop-shadow ${mode === "reels" && tab === id ? "text-white" : "text-white/55"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <style>{"@keyframes reelHeart{0%{transform:scale(.3);opacity:0}25%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:0}}"}</style>
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top))] pointer-events-none">
        {view ? (
          <button onClick={() => setView(null)} className="pointer-events-auto text-white drop-shadow" aria-label="Back"><ChevronLeft size={34} strokeWidth={1.8} /></button>
        ) : (
          <button onClick={() => (mode === "feed" ? setNewPost(true) : setCreating(true))} className="pointer-events-auto text-white drop-shadow" aria-label={mode === "feed" ? "New post" : "New reel"}>
            <Plus size={34} strokeWidth={1.8} />
          </button>
        )}
        {view ? (
          <h2 className="pointer-events-auto text-white text-[19px] font-bold drop-shadow truncate max-w-[60vw]">{view.label}</h2>
        ) : (
        <div className="pointer-events-auto flex items-center gap-4 relative">
          <button onClick={() => setMode("feed")} className={`text-[18px] font-bold drop-shadow ${mode === "feed" ? "text-white" : "text-white/55"}`}>Feed</button>
          <div className="flex items-center gap-1">
            {tabBtn(tab === "saved" ? "saved" : "foryou", tab === "saved" ? "Saved" : "Reels")}
            <button onClick={() => setPickTab((v) => !v)} className="text-white drop-shadow" aria-label="Choose feed"><ChevronDown size={20} /></button>
          </div>
          {tabBtn("friends", "Friends")}
          {pickTab && (
            <div className="absolute top-9 left-0 w-40 rounded-xl bg-neutral-900/95 shadow-2xl py-1 text-white text-[15px]">
              {[["foryou", "For you"], ["saved", "Saved"]].map(([id, label]) => (
                <button key={id} onClick={() => { setTab(id); setPickTab(false); }} className="w-full flex items-center justify-between px-4 py-2.5 active:bg-white/10">
                  {label} {tab === id && <Check size={16} className="text-[#25D366]" />}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        {view ? (
          <span className="size-8" aria-hidden />
        ) : (
          <button onClick={() => setSearching(true)} className="pointer-events-auto text-white drop-shadow" aria-label="Search"><Search size={28} strokeWidth={1.8} /></button>
        )}
      </div>

      <div className="absolute inset-x-0 top-0 bottom-[calc(56px+env(safe-area-inset-bottom))]">
        {mode === "feed" ? (
          <FeedView onCreate={() => setNewPost(true)} refreshKey={feedKey} />
        ) : loading && !reels.length ? (
          <div className="h-full flex items-center justify-center text-white"><Loader2 className="animate-spin" /></div>
        ) : !reels.length && failed ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white px-8 text-center">
            <p className="text-lg font-semibold">Couldn&apos;t load reels</p>
            <p className="text-white/60 text-[14px]">The server may be starting up. Check your internet and try again.</p>
            <button onClick={() => { setLoading(true); setFailed(false); load(true); }} className="px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Try again</button>
          </div>
        ) : !reels.length ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white px-8 text-center">
            <span className="size-20 rounded-full bg-white/10 flex items-center justify-center"><Film size={34} /></span>
            <p className="text-lg font-semibold">{tab === "friends" ? "No reels from people you follow" : tab === "saved" ? "Nothing saved yet" : "No reels yet"}</p>
            <p className="text-white/60 text-[14px]">
              {tab === "friends" ? "Tap Follow on a reel and their new reels show up here." : tab === "saved" ? "Tap the bookmark on a reel to keep it here." : "Reels from people you can see appear here. Post the first one!"}
            </p>
            {tab === "foryou" && <button onClick={() => setCreating(true)} className="px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Create reel</button>}
          </div>
        ) : (
          <div ref={box} className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-contain">
            {reels.map((r, idx) => (
              r.source === "instagram" ? (
                <InstaReel key={r._key || r._id} reel={r} active={r._id === (activeId || reels[0]._id)} near={idx > activeIdx && idx <= activeIdx + 2} />
              ) : (
              <ReelItem key={r._key || r._id} reel={r} active={r._id === (activeId || reels[0]._id)} muted={muted} setMuted={setMuted} onLike={like} onComments={async (x) => { const real = await materialize(x); if (real) setCommentsFor(real); }} onShare={shareReel} onSave={save} onFollow={follow} onMenu={setMenuFor} onRepost={repost} onNext={goNext} near={idx > activeIdx && idx <= activeIdx + 2} onTag={(t) => setView({ kind: "tag", arg: t, label: `#${t}` })} onUser={(u) => setView({ kind: "user", arg: u._id, label: u.fullName })} />
              )
            ))}
          </div>
        )}

        {commentsFor && (
          <StatusComments
            targetId={commentsFor._id}
            onClose={() => setCommentsFor(null)}
            onTotal={(n) => setReels((l) => l.map((r) => (r._id === commentsFor._id ? { ...r, comments: n } : r)))}
          />
        )}
        {insightsFor && <Insights reel={insightsFor} onClose={() => setInsightsFor(null)} />}
        {reportFor && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-end" onClick={() => setReportFor(null)}>
            <div className="w-full bg-neutral-900 rounded-t-3xl pb-4 text-white wa-pop-in" onClick={(e) => e.stopPropagation()}>
              <p className="px-6 pt-5 pb-2 text-[16px] font-semibold">Why are you reporting this reel?</p>
              {REPORT_REASONS.map(([id, label]) => (
                <button key={id} onClick={() => { const r = reportFor; setReportFor(null); hide(r, id); }} className="w-full text-left px-6 py-3.5 text-[16px] active:bg-white/10">{label}</button>
              ))}
            </div>
          </div>
        )}
        {sendFor && <SendReelModal reel={sendFor} onClose={() => setSendFor(null)} />}
        {menuFor && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-end" onClick={() => setMenuFor(null)}>
            <div className="w-full bg-neutral-900 rounded-t-3xl pb-4 text-white wa-pop-in" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-white/25" />
              {[
                { icon: muted ? VolumeX : Volume2, label: muted ? "Turn sound on" : "Mute sound", run: () => setMuted(!muted) },
                { icon: Bookmark, label: menuFor.saved ? "Remove from saved" : "Save reel", run: () => save(menuFor) },
                { icon: Link2, label: "Copy link", run: async () => { const r = await asReel(menuFor); if (r) copyLink(r); } },
                { icon: Bookmark, label: "Saved reels", run: () => setTab("saved") },
                ...(menuFor.mine && menuFor.source === "reel" ? [{ icon: BarChart3, label: "Insights", run: () => setInsightsFor(menuFor) }] : []),
                ...(!menuFor.mine ? [{ icon: EyeOff, label: "Not interested", run: () => hide(menuFor) }, { icon: Flag, label: "Report", run: () => setReportFor(menuFor), danger: true }] : []),
                ...(menuFor.mine && menuFor.source === "reel" ? [{ icon: Trash2, label: "Delete reel", run: () => remove(menuFor), danger: true }] : []),
                ...(isOwner ? [{ icon: Flag, label: "Review reported reels", run: () => setReviewing(true) }] : []),
                ...(isOwner && !menuFor.mine && menuFor.source === "reel" ? [{ icon: Trash2, label: "Remove reel (owner)", run: async () => { if (!window.confirm("Remove this reel for everyone?")) return; try { await axiosInstance.delete(`/reels/admin/${menuFor._id}`); setReels((l) => l.filter((r) => r._id !== menuFor._id)); } catch { toast.error("Couldn't remove"); } }, danger: true }] : []),
              ].map((it) => (
                <button key={it.label} onClick={() => { setMenuFor(null); it.run(); }} className={`w-full flex items-center gap-4 px-6 py-3.5 text-[16px] active:bg-white/10 ${it.danger ? "text-red-400" : ""}`}>
                  <it.icon size={22} /> {it.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar like Instagram: Home · Reels · Updates · Calls · You */}
      <nav className="absolute bottom-0 inset-x-0 h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-black flex items-center justify-around z-30">
        <button onClick={() => navigate("/")} className="flex-1 flex justify-center text-white" aria-label="Chats"><House size={28} strokeWidth={1.8} /></button>
        <button onClick={() => navigate("/status")} className="flex-1 flex justify-center text-white" aria-label="Updates"><CircleDashed size={28} strokeWidth={1.8} /></button>
        <span className="flex-1 flex justify-center"><span className="px-5 py-2 rounded-full bg-white/15 text-white"><Film size={26} fill="currentColor" strokeWidth={1.5} /></span></span>
        <button onClick={() => navigate("/calls")} className="flex-1 flex justify-center text-white" aria-label="Calls"><Phone size={26} strokeWidth={1.8} /></button>
        <button onClick={() => navigate("/profile")} className="flex-1 flex justify-center" aria-label="You">
          <img src={optimizeImage(me?.profilePic || "/avatar.png", 80)} alt="" className="size-8 rounded-full object-cover" />
        </button>
      </nav>

      {newPost && <NewPost onClose={() => setNewPost(false)} onPosted={() => { setNewPost(false); setFeedKey((k) => k + 1); }} />}
      {reviewing && <ReportsReview onClose={() => setReviewing(false)} onRemoved={(id) => setReels((l) => l.filter((r) => r._id !== id))} />}
      {searching && (
        <SearchReels
          onClose={() => setSearching(false)}
          onTag={(t) => { setSearching(false); setView({ kind: "tag", arg: t, label: `#${t}` }); }}
          onOpen={(r, q) => { setSearching(false); setView({ kind: "search", arg: q, label: q, startId: r._id }); }}
        />
      )}
      {creating && (
        <NewReel
          onClose={() => setCreating(false)}
          onPosted={(r) => {
            setCreating(false);
            setTab("foryou");
            setReels((l) => [{ ...r, source: "reel" }, ...l]);
            setActiveId(r._id);
            box.current?.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
};

export default ReelsPage;
