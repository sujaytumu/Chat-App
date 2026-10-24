import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Heart, MessageCircle, Send, Plus, Volume2, VolumeX, Trash2, Loader2, X, Film, Play, Music, Bookmark, AlignJustify, ChevronDown, House, CircleDashed, Phone, Link2, Check, Repeat2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useAuthStore } from "../store/useAuthStore";
import StatusComments from "../components/StatusComments";
import SendReelModal from "../components/SendReelModal";
import StatusMusicSheet from "../components/StatusMusicSheet";
import { SongBars } from "../components/StatusSong";
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

const MAX_MB = 10;
const MAX_TOTAL_MB = 12; // video + song together (they travel in one request)
const MAX_SECONDS = 60;
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

const Rail = ({ icon: Icon, label, onClick, active, fill, size = 30 }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.6)] active:scale-90 transition-transform">
    <Icon size={size} className={active ? "text-[#ff3040]" : ""} fill={fill ? "currentColor" : "none"} strokeWidth={1.7} />
    {label !== undefined && <span className="text-[13px] font-semibold tabular-nums leading-none">{label}</span>}
  </button>
);

const ReelItem = ({ reel, active, muted, setMuted, onLike, onComments, onShare, onSave, onFollow, onMenu, onRepost, onNext }) => {
  const video = useRef(null);
  const songEl = useRef(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const [progress, setProgress] = useState(0);
  const [more, setMore] = useState(false);
  const [scrub, setScrub] = useState(false);
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
    setProgress(end > start ? Math.min(1, Math.max(0, (v.currentTime - start) / (end - start))) : 0);
  };

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
    setProgress(f);
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

  const tap = () => {
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
    <section className="h-full w-full snap-start snap-always relative bg-black flex items-center justify-center overflow-hidden" data-reel={reel._id}>
      <video
        ref={video}
        src={reel.videoUrl}
        poster={reel.poster}
        playsInline
        preload={active ? "auto" : "metadata"}
        onTimeUpdate={onTime}
        onEnded={finished}
        onLoadedMetadata={(e) => { if (reel.trim?.start) e.currentTarget.currentTime = reel.trim.start; }}
        style={{ filter: filterCss(reel.filter) }}
        className="absolute inset-0 w-full h-full object-contain"
      />
      {reel.song?.url && <audio ref={songEl} src={reel.song.url} loop preload={active ? "auto" : "none"} />}
      <div className="absolute inset-0" onClick={tap} />
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
        <Rail icon={Heart} size={32} label={count(reel.likeCount)} active={reel.liked} fill={reel.liked} onClick={() => onLike(reel, !reel.liked)} />
        <Rail icon={MessageCircle} size={31} label={count(reel.comments)} onClick={() => onComments(reel)} />
        <Rail icon={Repeat2} size={31} label={count(reel.reposts)} active={reel.reposted} onClick={() => onRepost(reel)} />
        <Rail icon={Send} size={29} label={count(reel.views)} onClick={() => onShare(reel)} />
        <Rail icon={Bookmark} size={29} label={count(reel.saves)} fill={reel.saved} onClick={() => onSave(reel)} />
        <Rail icon={AlignJustify} size={26} onClick={() => onMenu(reel)} />
      </div>

      <div className="absolute left-4 right-[72px] bottom-6 text-white z-10">
        {reel.repostedBy && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-white/85"><Repeat2 size={14} /> {reel.repostedBy.fullName} reposted</p>
        )}
        <div className="flex items-center gap-2.5">
          <img src={optimizeImage(reel.user?.profilePic || "/avatar.png", 96)} alt="" className="size-10 rounded-full object-cover border border-white/30 bg-neutral-800" />
          <span className="font-semibold text-[15.5px] drop-shadow truncate max-w-[40vw]">{reel.user?.fullName}</span>
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
            {reel.caption}
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
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
          {scrub && <span className="absolute top-1/2 size-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow" style={{ left: `${progress * 100}%` }} />}
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
      const res = await axiosInstance.post("/reels", { video: data, caption, duration, filter, ...(trimmed ? { trim: { start: range[0], end: effEnd } } : {}), ...(song ? { song: { data: song.data, name: song.name, mime: song.mime, size: song.size, start: 0 } } : {}) }, { timeout: 180000, onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
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

const ReelsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.authUser);
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
      const { data } = tab === "saved" ? await axiosInstance.get("/reels/saved", { timeout: 20000 }) : await axiosInstance.get("/reels", { params, timeout: 20000 });
      if (my !== gen.current) return;
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
  }, [tab]);

  // (re)load whenever the tab changes; a shared reel link is shown first
  useEffect(() => {
    cursor.current = { before: null, px: 1 };
    setLoading(true);
    setReels([]);
    setActiveId(null);
    box.current?.scrollTo({ top: 0 });
    (async () => {
      const wanted = tab === "foryou" ? params.get("r") : null;
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
  }, [tab, params, load]);

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
    if (!activeId || !more || tab === "saved") return;
    const i = reels.findIndex((r) => r._id === activeId);
    if (i >= reels.length - 3 && reels.length) load(false);
  }, [activeId, reels, more, load, tab]);

  // Called when a reel finishes: slide to the next one. Returns false on the last reel so it can replay.
  const goNext = useCallback((id) => {
    const root = box.current;
    const cur = root?.querySelector(`[data-reel="${id}"]`);
    const next = cur?.nextElementSibling;
    if (!next || !next.hasAttribute("data-reel")) return false;
    next.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }, []);

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
    const reel = await materialize(item);
    if (!reel) return;
    patch(reel._id, (r) => ({ liked, likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)) }));
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
    <button onClick={() => setTab(id)} className={`text-[21px] font-bold drop-shadow ${tab === id ? "text-white" : "text-white/55"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <style>{"@keyframes reelHeart{0%{transform:scale(.3);opacity:0}25%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:0}}"}</style>
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top))] pointer-events-none">
        <button onClick={() => setCreating(true)} className="pointer-events-auto text-white drop-shadow" aria-label="New reel">
          <Plus size={34} strokeWidth={1.8} />
        </button>
        <div className="pointer-events-auto flex items-center gap-5 relative">
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
        <span className="size-8" aria-hidden />
      </div>

      <div className="absolute inset-x-0 top-0 bottom-[calc(56px+env(safe-area-inset-bottom))]">
        {loading && !reels.length ? (
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
            {reels.map((r) => (
              <ReelItem key={r._key || r._id} reel={r} active={r._id === (activeId || reels[0]._id)} muted={muted} setMuted={setMuted} onLike={like} onComments={async (x) => { const real = await materialize(x); if (real) setCommentsFor(real); }} onShare={shareReel} onSave={save} onFollow={follow} onMenu={setMenuFor} onRepost={repost} onNext={goNext} />
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
                ...(menuFor.mine && menuFor.source === "reel" ? [{ icon: Trash2, label: "Delete reel", run: () => remove(menuFor), danger: true }] : []),
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
