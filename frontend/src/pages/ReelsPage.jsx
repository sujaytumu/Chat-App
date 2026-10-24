import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Heart, MessageCircle, Send, Plus, Volume2, VolumeX, Trash2, Loader2, X, Film, Play } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useAuthStore } from "../store/useAuthStore";
import StatusComments from "../components/StatusComments";
import SendReelModal from "../components/SendReelModal";

// Reels: short vertical videos from people you can see — swipe up for the next one, double-tap to like,
// comments, share, and your own post button. Same privacy rule as chats ("who can see whom").

const MAX_MB = 10;
const MAX_SECONDS = 60;
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

const Rail = ({ icon: Icon, label, onClick, active, fill }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 text-white drop-shadow active:scale-90 transition-transform">
    <Icon size={30} className={active ? "text-[#ff3040]" : ""} fill={fill ? "currentColor" : "none"} strokeWidth={1.8} />
    {label !== undefined && <span className="text-[12px] font-medium tabular-nums">{label}</span>}
  </button>
);

const ReelItem = ({ reel, active, muted, setMuted, onLike, onComments, onShare, onDelete }) => {
  const video = useRef(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const [progress, setProgress] = useState(0);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      setPaused(false);
      v.currentTime = 0;
      v.muted = muted;
      v.play().catch(() => {
        // sound blocked until a tap: start muted so it still plays
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
      axiosInstance.put(`/reels/${reel._id}/view`).catch(() => {});
    } else {
      v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reel._id]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

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
        setPaused(false);
      } else {
        v.pause();
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
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        className="absolute inset-0 w-full h-full object-contain"
      />
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
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <Rail icon={Heart} label={count(reel.likeCount)} active={reel.liked} fill={reel.liked} onClick={() => onLike(reel, !reel.liked)} />
        <Rail icon={MessageCircle} label={count(reel.comments)} onClick={() => onComments(reel)} />
        <Rail icon={Send} onClick={() => onShare(reel)} />
        <Rail icon={muted ? VolumeX : Volume2} onClick={() => setMuted(!muted)} />
        {reel.mine && <Rail icon={Trash2} onClick={() => onDelete(reel)} />}
      </div>

      <div className="absolute left-4 right-20 bottom-[calc(28px+env(safe-area-inset-bottom))] text-white z-10 pointer-events-none">
        <div className="flex items-center gap-2.5">
          <img src={optimizeImage(reel.user?.profilePic || "/avatar.png", 96)} alt="" className="size-9 rounded-full object-cover border border-white/40" />
          <span className="font-semibold text-[15px] drop-shadow truncate">{reel.user?.fullName}</span>
        </div>
        {reel.caption && <p className="mt-2 text-[14px] leading-snug drop-shadow line-clamp-3 whitespace-pre-wrap break-words">{reel.caption}</p>}
        <p className="mt-1 text-[12px] text-white/70">{count(reel.views)} views</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25 z-10">
        <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
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
  const pick = useRef(null);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const choose = (f) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Pick a video");
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`Keep the video under ${MAX_MB} MB`);
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  const post = async () => {
    if (!file || busy) return;
    if (duration > MAX_SECONDS + 0.5) return toast.error(`Reels can be at most ${MAX_SECONDS} seconds`);
    setBusy(true);
    try {
      const data = await new Promise((ok, bad) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = bad;
        r.readAsDataURL(file);
      });
      const res = await axiosInstance.post("/reels", { video: data, caption, duration }, { timeout: 180000, onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
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
          <video src={url} controls playsInline muted loop onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} className="max-h-full max-w-full rounded-xl" />
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
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 300))}
          disabled={busy}
          placeholder="Write a caption…"
          className="w-full rounded-full bg-white/10 px-4 py-3 text-[15px] outline-none placeholder:text-white/50"
        />
        {file && !busy && <button onClick={() => pick.current?.click()} className="text-sm text-white/70 underline">Choose another video</button>}
      </div>
    </div>
  );
};

const ReelsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.authUser);
  const [reels, setReels] = useState([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sendFor, setSendFor] = useState(null);
  const box = useRef(null);
  const loadingMore = useRef(false);

  const load = useCallback(async (before) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const { data } = await axiosInstance.get("/reels", { params: before ? { before } : {} });
      setReels((cur) => {
        const seen = new Set(cur.map((r) => r._id));
        return [...cur, ...data.reels.filter((r) => !seen.has(r._id))];
      });
      setMore(!!data.more);
    } catch {
      if (!before) toast.error("Couldn't load reels");
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const wanted = params.get("r");
      if (wanted) {
        try {
          const { data } = await axiosInstance.get(`/reels/${wanted}`);
          setReels([data]);
        } catch {
          toast.error("This reel isn't available");
        }
      }
      load();
    })();
  }, [load, params]);

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
    if (!activeId || !more) return;
    const i = reels.findIndex((r) => r._id === activeId);
    if (i >= reels.length - 3 && reels.length) load(reels[reels.length - 1].createdAt);
  }, [activeId, reels, more, load]);

  const like = async (reel, liked) => {
    setReels((l) => l.map((r) => (r._id === reel._id ? { ...r, liked, likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)) } : r)));
    try {
      await axiosInstance.put(`/reels/${reel._id}/like`, { liked });
    } catch {
      setReels((l) => l.map((r) => (r._id === reel._id ? { ...r, liked: !liked, likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)) } : r)));
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

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <style>{"@keyframes reelHeart{0%{transform:scale(.3);opacity:0}25%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:0}}"}</style>
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 pt-[calc(10px+env(safe-area-inset-top))] pointer-events-none">
        <button onClick={() => navigate("/")} className="pointer-events-auto size-10 rounded-full bg-black/35 text-white flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-white text-[18px] font-semibold drop-shadow">Reels</h2>
        <button onClick={() => setCreating(true)} className="pointer-events-auto size-10 rounded-full bg-black/35 text-white flex items-center justify-center" aria-label="New reel">
          <Plus size={24} />
        </button>
      </div>

      {loading && !reels.length ? (
        <div className="h-full flex items-center justify-center text-white"><Loader2 className="animate-spin" /></div>
      ) : !reels.length ? (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-white px-8 text-center">
          <span className="size-20 rounded-full bg-white/10 flex items-center justify-center"><Film size={34} /></span>
          <p className="text-lg font-semibold">No reels yet</p>
          <p className="text-white/60 text-[14px]">Post the first one — people who can see you will watch it here.</p>
          <button onClick={() => setCreating(true)} className="px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Create reel</button>
        </div>
      ) : (
        <div ref={box} className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-contain">
          {reels.map((r) => (
            <ReelItem key={r._id} reel={r} active={r._id === (activeId || reels[0]._id)} muted={muted} setMuted={setMuted} onLike={like} onComments={setCommentsFor} onShare={setSendFor} onDelete={remove} />
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
      {creating && (
        <NewReel
          onClose={() => setCreating(false)}
          onPosted={(r) => {
            setCreating(false);
            setReels((l) => [r, ...l]);
            setActiveId(r._id);
            box.current?.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
};

export default ReelsPage;
