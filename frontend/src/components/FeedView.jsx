import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Send, ImagePlus, Loader2, Trash2, X, Image as ImageIcon } from "lucide-react";
import StatusComments from "./StatusComments";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";

// One photo, or a swipeable set with a 1/3 counter and dots
const PostImages = ({ images }) => {
  const [i, setI] = useState(0);
  if (images.length < 2) return <img src={optimizeImage(images[0], 1080)} alt="" loading="lazy" decoding="async" className="w-full h-auto max-h-[80vh] object-contain bg-black/40" />;
  return (
    <div className="relative">
      <div className="flex items-center bg-black/40 overflow-x-auto snap-x snap-mandatory no-scrollbar" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {images.map((src, k) => (
          <img key={k} src={optimizeImage(src, 1080)} alt="" loading="lazy" decoding="async" className="w-full h-auto shrink-0 snap-center self-center max-h-[80vh] object-contain bg-black/40" />
        ))}
      </div>
      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 text-[12px] text-white">{i + 1}/{images.length}</span>
      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1 pointer-events-none">
        {images.map((_, k) => <span key={k} className={`size-1.5 rounded-full ${k === i ? "bg-white" : "bg-white/40"}`} />)}
      </div>
    </div>
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

const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// Downscale big photos so the upload stays small
const shrink = (dataUrl, max = 1600) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });

export const NewPost = ({ onClose, onPosted }) => {
  const [imgs, setImgs] = useState([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...(e.target.files || [])].filter((f) => f.type.startsWith("image/")).slice(0, 10 - imgs.length);
    e.target.value = "";
    if (!files.length) return;
    const out = [];
    for (const f of files) out.push(await shrink(await readFile(f)));
    setImgs((cur) => [...cur, ...out].slice(0, 10));
  };
  const post = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/posts", { images: imgs, caption }, { timeout: 120000 });
      onPosted(data);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't post");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col text-white">
      <div className="flex items-center gap-3 px-4 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
        <button onClick={onClose} aria-label="Close"><X size={26} /></button>
        <h3 className="flex-1 text-[17px] font-semibold">New post</h3>
        <button disabled={!imgs.length || busy} onClick={post} className="text-[#25D366] font-semibold disabled:opacity-40">{busy ? "Posting…" : "Share"}</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4">
        {imgs.length ? (
          <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {imgs.map((src, i) => (
              <div key={i} className="relative shrink-0 snap-center w-[78%] max-w-[360px]">
                <img src={src} alt="" className="w-full h-[48vh] object-contain rounded-xl bg-black/40" />
                <button onClick={() => setImgs((c) => c.filter((_, k) => k !== i))} aria-label="Remove photo" className="absolute top-2 right-2 size-7 rounded-full bg-black/60 flex items-center justify-center"><X size={16} /></button>
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-[12px]">{i + 1}/{imgs.length}</span>
              </div>
            ))}
            {imgs.length < 10 && (
              <label className="shrink-0 w-[34%] h-[48vh] rounded-xl bg-white/10 flex flex-col items-center justify-center gap-2 text-white/70 cursor-pointer text-[13px] text-center">
                <ImagePlus size={28} /> Add more
                <input type="file" accept="image/*" multiple className="hidden" onChange={pick} />
              </label>
            )}
          </div>
        ) : (
          <label className="h-64 rounded-xl bg-white/10 flex flex-col items-center justify-center gap-2 text-white/70 cursor-pointer">
            <ImagePlus size={36} /> Choose photos (up to 10)
            <input type="file" accept="image/*" multiple className="hidden" onChange={pick} />
          </label>
        )}
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={3} placeholder="Write a caption…" className="mt-3 w-full rounded-xl bg-white/10 px-3.5 py-3 text-[14.5px] placeholder:text-white/50 outline-none resize-none" />
      </div>
    </div>
  );
};

// The Feed: photo posts from people you can see, 16 at a time
const FeedView = ({ onCreate, refreshKey }) => {
  const [posts, setPosts] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [pop, setPop] = useState(null);
  const next = useRef(null);
  const busy = useRef(false);

  const load = useCallback(async (reset) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { data } = await axiosInstance.get("/posts", { params: reset || !next.current ? {} : { before: next.current }, timeout: 20000 });
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
  }, []);

  useEffect(() => {
    next.current = null;
    setLoading(true);
    load(true);
  }, [load, refreshKey]);

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
          <p className="text-lg font-semibold">No posts yet</p>
          <p className="text-white/60 text-[14px]">Photos shared by people you can see appear here.</p>
          <button onClick={onCreate} className="px-6 py-3 rounded-full bg-[#25D366] text-black font-semibold">Share a photo</button>
        </div>
      ) : (
        <>
          {posts.map((p) => (
            <article key={p._id} className="mb-5 pb-4 border-b border-white/[0.06]" style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}>
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className="rounded-full p-[2px] bg-gradient-to-tr from-[#25D366] to-[#7CFFB2]"><img src={optimizeImage(p.user?.profilePic || "/avatar.png", 80)} alt="" className="size-8 rounded-full object-cover border-2 border-black" /></span>
                <span className="flex-1 text-[14px] font-semibold truncate">{p.user?.fullName}</span>
                <span className="text-[12px] text-white/50">{ago(p.createdAt)}</span>
                {p.mine && <button onClick={() => remove(p)} className="text-white/60" aria-label="Delete post"><Trash2 size={18} /></button>}
              </div>
              <div className="relative" onDoubleClick={() => doubleTap(p)}>
                <PostImages images={p.images?.length ? p.images : [p.image]} />
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
                    <span className="text-[13.5px] tabular-nums">{p.likeCount > 0 ? p.likeCount : ""}</span>
                  </button>
                  <button onClick={() => setCommentsFor(p)} className="flex items-center gap-1.5 active:scale-90 transition-transform" aria-label="Comments">
                    <MessageCircle size={25} strokeWidth={1.8} />
                    <span className="text-[13.5px] tabular-nums">{p.comments > 0 ? p.comments : ""}</span>
                  </button>
                  <button onClick={() => share(p)} className="active:scale-90 transition-transform" aria-label="Share"><Send size={24} strokeWidth={1.8} /></button>
                </div>
                {p.caption && <p className="mt-1 text-[14px] break-words"><b className="mr-1.5">{p.user?.fullName}</b>{p.caption}</p>}
              </div>
            </article>
          ))}
          {more && <MoreSentinel key={posts.length} onVisible={() => load(false)} />}
        </>
      )}
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
