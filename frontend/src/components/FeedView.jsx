import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Send, Loader2, Trash2, Pencil, X, Bookmark, Image as ImageIcon, Music, Play, Pause } from "lucide-react";
import StatusComments from "./StatusComments";
import ImageLightbox from "./ImageLightbox";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";

// One photo, or a swipeable set with a 1/3 counter and dots.
// One tap opens the photo full screen (zoom, swipe); a quick double tap likes it.
const PostImages = ({ images, onOpen, onDouble }) => {
  const [i, setI] = useState(0);
  const tap = useRef({ t: 0, timer: null });
  useEffect(() => () => clearTimeout(tap.current.timer), []);
  const onTap = (k) => {
    const now = Date.now();
    if (now - tap.current.t < 300) {
      clearTimeout(tap.current.timer);
      tap.current.t = 0;
      onDouble?.();
      return;
    }
    tap.current.t = now;
    clearTimeout(tap.current.timer);
    tap.current.timer = setTimeout(() => onOpen?.(k), 300);
  };
  if (images.length < 2) return <img src={optimizeImage(images[0], 1080)} alt="" loading="lazy" decoding="async" onClick={() => onTap(0)} className="w-full h-auto max-h-[80vh] object-contain bg-black/40" />;
  return (
    <div className="relative">
      <div className="flex items-center bg-black/40 overflow-x-auto snap-x snap-mandatory no-scrollbar" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {images.map((src, k) => (
          <img key={k} src={optimizeImage(src, 1080)} alt="" loading="lazy" decoding="async" onClick={() => onTap(k)} className="w-full h-auto shrink-0 snap-center self-center max-h-[80vh] object-contain bg-black/40" />
        ))}
      </div>
      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 text-[12px] text-white pointer-events-none">{i + 1}/{images.length}</span>
      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1 pointer-events-none">
        {images.map((_, k) => <span key={k} className={`size-1.5 rounded-full ${k === i ? "bg-white" : "bg-white/40"}`} />)}
      </div>
    </div>
  );
};

// Edit the caption and lines of your own post
const EditPostSheet = ({ post, onClose, onSaved }) => {
  const [caption, setCaption] = useState(post.caption || "");
  const [lines, setLines] = useState(post.lines || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.put(`/posts/${post._id}`, { caption, lines });
      onSaved(data);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-wa-pop text-wa-text px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-[18px] font-semibold">Edit post</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center"><X size={22} /></button>
        </div>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={3} placeholder="Caption" className="w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] outline-none resize-none placeholder:text-wa-muted" />
        <textarea value={lines} onChange={(e) => setLines(e.target.value)} maxLength={300} rows={3} placeholder="Lines (lyrics, a quote…)" className="mt-2 w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] outline-none resize-none placeholder:text-wa-muted" />
        <button onClick={save} disabled={busy} className="mt-4 w-full h-12 rounded-full bg-[#21C063] text-black font-semibold text-[16px] disabled:opacity-60 active:scale-[.98]">{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
};

// Who liked your post
const LikersSheet = ({ post, onClose }) => {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    let dead = false;
    axiosInstance.get(`/posts/${post._id}/likes`).then((r) => !dead && setUsers(r.data.users)).catch(() => { if (!dead) { setUsers([]); toast.error("Couldn't load likes"); } });
    return () => { dead = true; };
  }, [post._id]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full max-h-[70vh] flex flex-col rounded-t-3xl bg-wa-pop text-wa-text pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className="text-[18px] font-semibold">Likes</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain pb-4">
          {users === null ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-wa-muted" /></div>
            : !users.length ? <p className="py-10 text-center text-wa-muted text-[14px]">No likes yet</p>
            : users.map((u) => (
              <div key={u._id} className="flex items-center gap-3 px-5 py-2.5">
                <img src={optimizeImage(u.profilePic || "/avatar.png", 80)} alt="" className="size-11 rounded-full object-cover" />
                <span className="flex-1 text-[16px] truncate">{u.fullName}</span>
                <Heart size={16} className="text-red-500" fill="currentColor" strokeWidth={0} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

// The song kept with a post: tap to play / pause (only one song plays at a time)
let playingPostSong = null;
const PostSong = ({ song }) => {
  const el = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => () => { el.current?.pause(); }, []);
  const toggle = () => {
    if (!el.current) {
      const a = new Audio(song.url);
      a.loop = true;
      a.onplay = () => setOn(true);
      a.onpause = () => setOn(false);
      el.current = a;
    }
    const a = el.current;
    if (a.paused) {
      if (playingPostSong && playingPostSong !== a) playingPostSong.pause();
      playingPostSong = a;
      if (!a.currentTime && song.start) a.currentTime = song.start;
      a.play().catch(() => toast.error("Couldn't play the song"));
    } else a.pause();
  };
  return (
    <button onClick={toggle} className="mt-2 inline-flex items-center gap-2 max-w-full pl-2.5 pr-3.5 h-8 rounded-full bg-white/10 active:bg-white/20 text-[13px]" aria-label={on ? "Pause song" : "Play song"}>
      {on ? <Pause size={14} /> : <Play size={14} />}
      <Music size={13} className="text-[#25D366] shrink-0" />
      <span className="truncate">{song.name}</span>
    </button>
  );
};

// Loads the next posts by itself when you scroll near the end (no "Load more" tap)
const MoreSentinel = ({ onVisible }) => {
  const el = useRef(null);
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onVisible(), { rootMargin: "400px" });
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={el} className="h-10 flex justify-center items-center"><Loader2 size={18} className="animate-spin text-white/40" /></div>;
};

const ago = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export { default as NewPost } from "./NewPost";

// The Feed: photo posts from people you can see, 16 at a time
const FeedView = ({ onCreate, refreshKey }) => {
  const [posts, setPosts] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [pop, setPop] = useState(null);
  const [tab, setTab] = useState("all"); // all | saved
  const [likersFor, setLikersFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewer, setViewer] = useState(null); // { images, src } - photo open full screen
  const next = useRef(null);
  const busy = useRef(false);

  const load = useCallback(async (reset) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { data } = await axiosInstance.get(tab === "saved" ? "/posts/saved" : "/posts", { params: tab === "saved" || reset || !next.current ? {} : { before: next.current }, timeout: 20000 });
      next.current = data.next;
      setPosts((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((p) => p._id));
        return [...base, ...data.posts.filter((p) => !seen.has(p._id))];
      });
      setMore(!!data.more);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    next.current = null;
    setPosts([]);
    setLoading(true);
    load(true);
  }, [load, refreshKey]);

  const save = async (p) => {
    const saved = !p.saved;
    setPosts((l) => (tab === "saved" && !saved ? l.filter((x) => x._id !== p._id) : l.map((x) => (x._id === p._id ? { ...x, saved } : x))));
    try {
      await axiosInstance.put(`/posts/${p._id}/save`, { saved });
      toast(saved ? "Saved" : "Removed from saved", { icon: saved ? "🔖" : "✖️" });
    } catch {
      setPosts((l) => l.map((x) => (x._id === p._id ? { ...x, saved: !saved } : x)));
      toast.error("Couldn't save");
    }
  };

  const like = async (p) => {
    const liked = !p.liked;
    setPosts((l) => l.map((x) => (x._id === p._id ? { ...x, liked, likeCount: x.likeCount + (liked ? 1 : -1) } : x)));
    try {
      await axiosInstance.put(`/posts/${p._id}/like`, { liked });
    } catch {
      setPosts((l) => l.map((x) => (x._id === p._id ? { ...x, liked: !liked, likeCount: x.likeCount + (liked ? -1 : 1) } : x)));
    }
  };
  const share = async (p) => {
    const url = p.image;
    const text = `${p.user?.fullName || "Talkies"}${p.caption ? ": " + p.caption : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "Talkies", text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };
  const doubleTap = (p) => {
    setPop(p._id);
    setTimeout(() => setPop((x) => (x === p._id ? null : x)), 800);
    if (!p.liked) like(p);
  };
  const remove = async (p) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axiosInstance.delete(`/posts/${p._id}`);
      setPosts((l) => l.filter((x) => x._id !== p._id));
    } catch {
      toast.error("Couldn't delete");
    }
  };

  return (
    <div className="h-full overflow-y-auto pt-[calc(60px+env(safe-area-inset-top))] pb-6 bg-black text-white overscroll-contain">
      <div className="flex gap-2 px-3 pb-3">
        {[["all", "All posts"], ["saved", "Saved"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-9 px-4 rounded-full text-[14px] ${tab === id ? "bg-white text-black font-semibold" : "bg-white/10 text-white/80"}`}>{label}</button>
        ))}
      </div>
      {loading && !posts.length ? (
        <div className="px-3 space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-2.5 py-2"><div className="size-8 rounded-full bg-white/10" /><div className="h-3 w-28 rounded bg-white/10" /></div>
              <div className="aspect-square w-full rounded-xl bg-white/10" />
              <div className="h-3 w-40 rounded bg-white/10 mt-3" />
            </div>
          ))}
        </div>
      ) : failed && !posts.length ? (
        <div className="py-20 text-center px-8">
          <p className="font-semibold">Couldn&apos;t load the feed</p>
          <button onClick={() => { setLoading(true); load(true); }} className="mt-4 px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Try again</button>
        </div>
      ) : !posts.length ? (
        <div className="py-20 flex flex-col items-center gap-3 px-8 text-center">
          <span className="size-20 rounded-full bg-white/10 flex items-center justify-center"><ImageIcon size={34} /></span>
          <p className="text-lg font-semibold">{tab === "saved" ? "Nothing saved yet" : "No posts yet"}</p>
          <p className="text-white/60 text-[14px]">{tab === "saved" ? "Tap the bookmark under a post to keep it here." : "Photos shared by people you can see appear here."}</p>
          {tab !== "saved" && <button onClick={onCreate} className="px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Share a photo</button>}
        </div>
      ) : (
        <>
          {posts.map((p) => (
            <article key={p._id} className="mb-5 pb-4 border-b border-white/[0.06]" style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}>
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className="rounded-full p-[2px] bg-gradient-to-tr from-[#25D366] to-[#7CFFB2]"><img src={optimizeImage(p.user?.profilePic || "/avatar.png", 80)} alt="" className="size-8 rounded-full object-cover border-2 border-black" /></span>
                <span className="flex-1 text-[14px] font-semibold truncate">{p.user?.fullName}</span>
                <span className="text-[12px] text-white/50">{ago(p.createdAt)}</span>
                {p.mine && <button onClick={() => setEditing(p)} className="text-white/60" aria-label="Edit post"><Pencil size={17} /></button>}
                {p.mine && <button onClick={() => remove(p)} className="text-white/60" aria-label="Delete post"><Trash2 size={18} /></button>}
              </div>
              <div className="relative">
                <PostImages images={p.images?.length ? p.images : [p.image]} onDouble={() => doubleTap(p)} onOpen={(k) => { const list = p.images?.length ? p.images : [p.image]; setViewer({ images: list, src: list[k] }); }} />
                {pop === p._id && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Heart size={96} className="text-white drop-shadow-lg" fill="#ff3040" strokeWidth={0} style={{ animation: "reelHeart .8s ease-out forwards" }} />
                  </div>
                )}
              </div>
              <div className="px-3 pt-2.5">
                <div className="flex items-center gap-5">
                  <button onClick={() => like(p)} className="flex items-center gap-1.5 active:scale-90 transition-transform" aria-label="Like">
                    <Heart size={26} className={p.liked ? "text-red-500" : ""} fill={p.liked ? "currentColor" : "none"} strokeWidth={1.8} />
                    {!p.mine && <span className="text-[13.5px] tabular-nums">{p.likeCount > 0 ? p.likeCount : ""}</span>}
                  </button>
                  {p.mine && p.likeCount > 0 && <button onClick={() => setLikersFor(p)} className="-ml-3.5 text-[13.5px] tabular-nums underline-offset-2 active:opacity-60" aria-label="See who liked">{p.likeCount}</button>}
                  <button onClick={() => setCommentsFor(p)} className="flex items-center gap-1.5 active:scale-90 transition-transform" aria-label="Comments">
                    <MessageCircle size={25} strokeWidth={1.8} />
                    <span className="text-[13.5px] tabular-nums">{p.comments > 0 ? p.comments : ""}</span>
                  </button>
                  <button onClick={() => share(p)} className="active:scale-90 transition-transform" aria-label="Share"><Send size={24} strokeWidth={1.8} /></button>
                  <button onClick={() => save(p)} className="ml-auto active:scale-90 transition-transform" aria-label={p.saved ? "Remove from saved" : "Save"}><Bookmark size={25} strokeWidth={1.8} fill={p.saved ? "currentColor" : "none"} /></button>
                </div>
                {p.caption && <p className="mt-1 text-[14px] break-words"><b className="mr-1.5">{p.user?.fullName}</b>{p.caption}</p>}
                {p.song?.url && <PostSong song={p.song} />}
                {p.lines && <p className="mt-2 text-[14px] italic text-white/80 whitespace-pre-line break-words border-l-2 border-[#25D366]/70 pl-2.5">{p.lines}</p>}
              </div>
            </article>
          ))}
          {more && <MoreSentinel key={posts.length} onVisible={() => load(false)} />}
        </>
      )}
      {likersFor && <LikersSheet post={likersFor} onClose={() => setLikersFor(null)} />}
      {editing && <EditPostSheet post={editing} onClose={() => setEditing(null)} onSaved={(d) => { setPosts((l) => l.map((x) => (x._id === editing._id ? { ...x, ...d } : x))); setEditing(null); toast.success("Saved"); }} />}
      {viewer && <ImageLightbox src={viewer.src} gallery={viewer.images} onClose={() => setViewer(null)} />}
      {commentsFor && (
        <StatusComments
          targetId={commentsFor._id}
          onClose={() => setCommentsFor(null)}
          onTotal={(n) => setPosts((l) => l.map((x) => (x._id === commentsFor._id ? { ...x, comments: n } : x)))}
        />
      )}
    </div>
  );
};

export default FeedView;
