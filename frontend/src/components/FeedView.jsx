import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Send, Loader2, Trash2, Pencil, X, Bookmark, Eye, ChevronRight, Image as ImageIcon, Music, Volume2, VolumeX } from "lucide-react";
import StatusComments from "./StatusComments";
import PhotoViewer from "./PhotoViewer";
import StatusMusicSheet from "./StatusMusicSheet";
import StatusAudienceSheet, { audienceLabel } from "./StatusAudienceSheet";
import { readFileAsBase64 } from "../lib/fileUtils";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { optimizeImage } from "../lib/cdn";

// One photo, or a swipeable set with a 1/3 counter, dots and (on laptops) arrows.
// One tap opens the photo full screen (zoom, swipe); a quick double tap likes it.
// Every photo of a post sits in ONE fixed frame whose shape comes from the first photo (kept between
// 4:5 and 1.91:1, like Instagram) - so swiping to a taller or wider photo never resizes or stretches the others.
const ratioCache = new Map(); // photo address -> frame shape, so a post doesn't jump when it scrolls back into view
const frameShape = (w, h) => Math.min(1.91, Math.max(0.5625, w / h)); // 9:16 tall up to 1.91:1 wide
const PT_POS = { top: "12%", mid: "50%", bot: "88%" };
const PT_SIZES = [["S", 0.7], ["M", 1], ["L", 1.5]];
const PT_COLORS = ["#ffffff", "#111111", "#ffd43b", "#21C063", "#ff6b9d", "#4dabf7"];

// The line written on a photo, drawn over it (so it can be edited after posting)
const PhotoLine = ({ t }) =>
  t?.text ? (
    <div
      className="absolute inset-x-0 text-center font-bold leading-[1.25] whitespace-pre-wrap break-words pointer-events-none px-[6%]"
      style={{ top: PT_POS[t.pos] || PT_POS.bot, transform: "translateY(-50%)", color: t.color || "#fff", fontSize: `${5.5 * (t.size || 1)}cqw`, textShadow: "0 0 3px rgba(0,0,0,.75), 0 1px 4px rgba(0,0,0,.6)" }}
    >
      {t.text}
    </div>
  ) : null;

const PostImages = ({ images, texts = [], onOpen, onDouble }) => {
  const [i, setI] = useState(0);
  const [ar, setAr] = useState(() => ratioCache.get(images[0]) || 0.8);
  const rail = useRef(null);
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
  const first = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h) return;
    const shape = frameShape(w, h);
    ratioCache.set(images[0], shape);
    setAr(shape);
  };
  const go = (k) => {
    const el = rail.current;
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };
  const many = images.length > 1;
  return (
    <div className="relative w-full bg-black/40 overflow-hidden" style={{ aspectRatio: ar, maxHeight: "80vh" }}>
      <div
        ref={rail}
        className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar overscroll-x-contain"
        style={{ scrollSnapStop: "always", WebkitOverflowScrolling: "touch" }}
        onScroll={many ? (e) => { const n = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth); setI((cur) => (cur === n ? cur : n)); } : undefined}
      >
        {images.map((src, k) => (
          <div key={k} className="relative w-full h-full shrink-0 snap-center snap-always" style={{ containerType: "inline-size" }}>
            <img src={optimizeImage(src, 160)} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-45 pointer-events-none" />
            <img
              src={optimizeImage(src, 1080)}
              alt=""
              loading={k === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onLoad={k === 0 ? first : undefined}
              onClick={() => onTap(k)}
              className="relative w-full h-full object-contain"
            />
            <PhotoLine t={texts[k]} />
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 text-[12px] text-white pointer-events-none">{i + 1}/{images.length}</span>
          {i > 0 && <button type="button" onClick={() => go(i - 1)} className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/55 items-center justify-center text-white active:scale-90" aria-label="Previous photo"><ChevronRight size={18} className="rotate-180" /></button>}
          {i < images.length - 1 && <button type="button" onClick={() => go(i + 1)} className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/55 items-center justify-center text-white active:scale-90" aria-label="Next photo"><ChevronRight size={18} /></button>}
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1 pointer-events-none">
            {images.map((_, k) => <span key={k} className={`size-1.5 rounded-full ${k === i ? "bg-white" : "bg-white/40"}`} />)}
          </div>
        </>
      )}
    </div>
  );
};

// Edit your own post: caption, lines, song (add later / change / remove) and who can see it
const EditPostSheet = ({ post, autoSong = false, onClose, onSaved }) => {
  const [caption, setCaption] = useState(post.caption || "");
  const [lines, setLines] = useState(post.lines || "");
  const [song, setSong] = useState(post.song || null); // existing { url, name } or a new { data, name }
  const [songChanged, setSongChanged] = useState(false);
  const [audience, setAudience] = useState(post.audience || { mode: "all", users: [] });
  const [audChanged, setAudChanged] = useState(false);
  const [showMusic, setShowMusic] = useState(autoSong);
  const [showAud, setShowAud] = useState(false);
  const [busy, setBusy] = useState(false);
  const songInput = useRef(null);
  const imgs = post.images?.length ? post.images : [post.image];
  const [ptexts, setPtexts] = useState(() => imgs.map((_, k) => ({ text: "", color: "#ffffff", pos: "bot", size: 1, ...(post.photoText?.[k] || {}) })));
  const [ptChanged, setPtChanged] = useState(false);
  const setPt = (k, patch) => { setPtexts((l) => l.map((x, j) => (j === k ? { ...x, ...patch } : x))); setPtChanged(true); };

  const save = async () => {
    setBusy(true);
    try {
      const body = { caption, lines, ...(ptChanged ? { photoText: ptexts } : {}) };
      if (songChanged) {
        if (!song) body.removeSong = true;
        else if (song.data) body.song = { data: song.data, name: song.name };
      }
      if (audChanged) body.audience = audience;
      const { data } = await axiosInstance.put(`/posts/${post._id}`, body, { timeout: 90000 });
      onSaved(data);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60" onClick={busy ? undefined : onClose}>
      <div className="w-full max-h-[92vh] flex flex-col rounded-t-3xl bg-wa-pop text-wa-text" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className="text-[18px] font-semibold">Edit post</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="size-9 flex items-center justify-center"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-3">
          <label className="text-[12.5px] text-wa-muted">Caption</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={3} placeholder="Write a caption…" className="mt-1 w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] outline-none resize-none placeholder:text-wa-muted" />

          <label className="block mt-3 text-[12.5px] text-wa-muted">Song</label>
          {song ? (
            <div className="mt-1 flex items-center gap-2.5 rounded-2xl bg-wa-field pl-4 pr-1.5 h-12">
              <Music size={18} className="text-[#25D366] shrink-0" />
              <span className="flex-1 truncate text-[14.5px]">{song.name}</span>
              <button onClick={() => setShowMusic(true)} className="px-2.5 h-9 text-[13px] text-[#25D366] font-medium">Change</button>
              <button onClick={() => { setSong(null); setSongChanged(true); }} aria-label="Remove song" className="size-9 flex items-center justify-center text-wa-muted"><X size={18} /></button>
            </div>
          ) : (
            <button onClick={() => setShowMusic(true)} className="mt-1 w-full h-12 rounded-2xl bg-wa-field flex items-center gap-2.5 px-4 text-[15px] active:opacity-80"><Music size={18} className="text-[#25D366]" /> Add a song</button>
          )}

          <label className="block mt-3 text-[12.5px] text-wa-muted">Line on each photo</label>
          <div className="mt-1 space-y-2.5">
            {imgs.map((src, k) => (
              <div key={k} className="rounded-2xl bg-wa-field p-2.5">
                <div className="flex items-center gap-2.5">
                  <img src={optimizeImage(src, 160)} alt="" className="size-12 rounded-lg object-cover shrink-0" />
                  <input
                    value={ptexts[k]?.text || ""}
                    onChange={(e) => setPt(k, { text: e.target.value })}
                    maxLength={120}
                    placeholder={imgs.length > 1 ? `Line for photo ${k + 1}` : "Line on the photo"}
                    className="flex-1 min-w-0 h-11 rounded-xl bg-transparent text-[15px] outline-none"
                  />
                </div>
                {ptexts[k]?.text ? (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {[["top", "Top"], ["mid", "Middle"], ["bot", "Bottom"]].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setPt(k, { pos: id })} className={`px-2.5 h-7 rounded-full text-[12px] ${ptexts[k].pos === id ? "bg-[#21C063] text-black font-semibold" : "bg-white/10"}`}>{label}</button>
                    ))}
                    {PT_SIZES.map(([label, v]) => (
                      <button key={label} type="button" onClick={() => setPt(k, { size: v })} className={`size-7 rounded-full text-[12px] ${ptexts[k].size === v ? "bg-[#21C063] text-black font-semibold" : "bg-white/10"}`}>{label}</button>
                    ))}
                    {PT_COLORS.map((c) => (
                      <button key={c} type="button" aria-label="Colour" onClick={() => setPt(k, { color: c })} className={`size-6 rounded-full border-2 ${ptexts[k].color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <label className="block mt-3 text-[12.5px] text-wa-muted">Quote / lines for the whole post</label>
          <textarea value={lines} onChange={(e) => setLines(e.target.value)} maxLength={300} rows={3} placeholder="Lyrics, a quote…" className="mt-1 w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] outline-none resize-none placeholder:text-wa-muted" />

          <button onClick={() => setShowAud(true)} className="mt-3 w-full h-12 rounded-2xl bg-wa-field flex items-center gap-3 px-4 text-left active:opacity-80">
            <Eye size={19} className="text-wa-icon" />
            <span className="flex-1 text-[15px]">Who can see this</span>
            <span className="text-[13.5px] text-wa-muted">{audienceLabel(audience)}</span>
            <ChevronRight size={18} className="text-wa-muted" />
          </button>
        </div>
        <div className="px-5 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] shrink-0">
          <button onClick={save} disabled={busy} className="w-full h-12 rounded-full bg-[#21C063] text-black font-semibold text-[16px] disabled:opacity-60 active:scale-[.98] flex items-center justify-center gap-2">{busy ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : "Save"}</button>
        </div>
      </div>

      <input
        ref={songInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 4 * 1024 * 1024) return toast.error("Pick a song under 4 MB");
          setSong({ data: await readFileAsBase64(file), name: file.name.replace(/\.[^.]+$/, "") });
          setSongChanged(true);
          setShowMusic(false);
        }}
      />
      {showMusic && (
        <div onClick={(e) => e.stopPropagation()}>
          <StatusMusicSheet
            onClose={() => setShowMusic(false)}
            onPick={(sg) => { setSong(sg); setSongChanged(true); setShowMusic(false); }}
            onFiles={() => songInput.current?.click()}
          />
        </div>
      )}
      {showAud && (
        <div className="fixed inset-0 z-[95]" onClick={(e) => e.stopPropagation()}>
          <StatusAudienceSheet noun="post" value={audience} onClose={() => setShowAud(false)} onSave={(a) => { setAudience(a); setAudChanged(true); setShowAud(false); }} />
        </div>
      )}
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

// The song kept with a post. It starts by itself while that post is on screen (the one most in view),
// stops when you scroll past, and only one song plays at a time. Tap the pill to mute / unmute all songs.
const songs = new Map(); // id -> { ratio, play(), pause() }
let activeSong = null;
let songsMuted = (() => { try { return localStorage.getItem("postSongMuted") === "1"; } catch { return false; } })();
const muteListeners = new Set();
const pickSong = () => {
  let best = null;
  let bestRatio = 0.55; // a post must be at least ~half on screen
  for (const [id, sg] of songs) if (sg.ratio >= bestRatio) { best = id; bestRatio = sg.ratio; }
  if (document.hidden) best = null;
  if (best === activeSong) return;
  if (activeSong && songs.get(activeSong)) songs.get(activeSong).pause();
  activeSong = best;
  if (best) songs.get(best).play();
};
if (typeof document !== "undefined") document.addEventListener("visibilitychange", pickSong);
const setSongsMuted = (m) => {
  songsMuted = m;
  try { localStorage.setItem("postSongMuted", m ? "1" : "0"); } catch { /* ignore */ }
  muteListeners.forEach((fn) => fn(m));
};

const PostSong = ({ song, id }) => {
  const btn = useRef(null);
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(songsMuted);

  useEffect(() => {
    const fn = (m) => { setMuted(m); if (audio.current) audio.current.muted = m; };
    muteListeners.add(fn);
    return () => muteListeners.delete(fn);
  }, []);

  useEffect(() => {
    const getAudio = () => {
      if (!audio.current) {
        const a = new Audio(song.url);
        a.loop = true;
        a.preload = "auto";
        a.muted = songsMuted;
        a.onplaying = () => setPlaying(true);
        a.onpause = () => setPlaying(false);
        audio.current = a;
      }
      return audio.current;
    };
    const entry = {
      ratio: 0,
      play: () => {
        const a = getAudio();
        if (!a.currentTime && song.start) a.currentTime = song.start;
        a.muted = songsMuted;
        a.play().catch(() => {}); // if the phone refuses to start it by itself, the volume button starts it
      },
      pause: () => audio.current?.pause(),
    };
    songs.set(id, entry);
    const card = btn.current?.closest("article");
    let io;
    if (card && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((es) => { entry.ratio = es[es.length - 1].intersectionRatio; pickSong(); }, { threshold: [0, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
      io.observe(card);
    }
    return () => {
      io?.disconnect();
      songs.delete(id);
      if (activeSong === id) activeSong = null;
      audio.current?.pause();
      audio.current = null;
    };
  }, [id, song.url, song.start]);

  // Tapping only turns the volume on / off for all post songs (like Instagram). If the phone had blocked the
  // automatic start, turning the sound on also starts it.
  const tap = (e) => {
    e.stopPropagation();
    const next = !songsMuted;
    setSongsMuted(next);
    if (!next && (!audio.current || audio.current.paused)) {
      songs.get(id)?.play();
      activeSong = id;
    }
  };
  const off = muted || !playing;
  return (
    <button ref={btn} onClick={tap} className="absolute z-10 right-3 bottom-3 size-9 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center active:scale-90 transition-transform" aria-label={off ? "Sound on" : "Sound off"}>
      {off ? <VolumeX size={18} /> : <Volume2 size={18} />}
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

// "2 hours ago", like Instagram (the short form above stays for the compact places)
const agoLong = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  if (s < 60) return "Just now";
  const unit = (n, w) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return unit(Math.floor(s / 60), "minute");
  if (s < 86400) return unit(Math.floor(s / 3600), "hour");
  if (s < 7 * 86400) return unit(Math.floor(s / 86400), "day");
  return new Date(d).toLocaleDateString([], { day: "numeric", month: "long", year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

// The caption: the name in bold, two lines at most, then "… more" to read the rest.
const Caption = ({ name, text }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 110 || text.split("\n").length > 2;
  return (
    <p className="mt-1.5 text-[14px] break-words whitespace-pre-line">
      <b className="mr-1.5">{name}</b>
      {open || !long ? text : text.slice(0, 100).split("\n").slice(0, 2).join("\n").trimEnd() + "… "}
      {!open && long && <button onClick={() => setOpen(true)} className="text-white/55">more</button>}
    </p>
  );
};

export { default as NewPost } from "./NewPost";

// The Feed: photo posts from people you can see, 16 at a time
const FeedView = ({ onCreate, refreshKey, focusId, topPad = "calc(60px + env(safe-area-inset-top))" }) => {
  const navigate = useNavigate();
  const focusPost = useRef(null); // a post opened from a shared link: kept at the top of the feed
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
        const base = reset ? (focusPost.current ? [focusPost.current] : []) : cur;
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

  // Opened from a shared post link (…/post?p=<id>): show that post first
  useEffect(() => {
    focusPost.current = null;
    if (!focusId) return;
    let live = true;
    axiosInstance
      .get(`/posts/${focusId}`)
      .then(({ data }) => {
        if (!live) return;
        focusPost.current = data;
        setPosts((cur) => [data, ...cur.filter((x) => x._id !== data._id)]);
      })
      .catch(() => live && toast.error("That post isn't available"));
    return () => {
      live = false;
    };
  }, [focusId]);

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
    const url = `${window.location.origin}/post?p=${p._id}`; // opens this post
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
  // Tap a name or picture: your own profile, or a chat with that person
  const openProfile = (p) => {
    if (!p.user?._id) return;
    if (p.mine) return navigate("/profile");
    const known = useChatStore.getState().users.find((u) => String(u._id) === String(p.user._id));
    useChatStore.getState().setSelectedChat({ type: "direct", data: known || p.user });
    navigate("/");
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
    <div className="h-full overflow-y-auto pb-6 bg-black text-white overscroll-contain" style={{ paddingTop: topPad }}>
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
                <button type="button" onClick={() => openProfile(p)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left active:opacity-70" aria-label={`Open ${p.user?.fullName || "profile"}`}>
                <span className="rounded-full p-[2px] bg-gradient-to-tr from-[#25D366] to-[#7CFFB2]"><img src={optimizeImage(p.user?.profilePic || "/avatar.png", 80)} alt="" className="size-8 rounded-full object-cover border-2 border-black" /></span>
                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                  <span className="text-[14px] font-semibold truncate">{p.user?.fullName}</span>
                  {p.song?.url && <span className="flex items-center gap-1 text-[12px] text-white/70 truncate"><Music size={11} className="text-[#25D366] shrink-0" /><span className="truncate">{p.song.name}</span></span>}
                </span>
                </button>
                {p.mine && <button onClick={() => setEditing({ post: p })} className="h-8 pl-2.5 pr-3 rounded-full bg-white/12 active:bg-white/20 text-[13px] font-medium flex items-center gap-1.5" style={{ background: "rgba(255,255,255,.12)" }} aria-label="Edit post"><Pencil size={14} /> Edit</button>}
                {p.mine && <button onClick={() => remove(p)} className="size-8 flex items-center justify-center text-white/60" aria-label="Delete post"><Trash2 size={18} /></button>}
              </div>
              <div className="relative">
                <PostImages images={p.images?.length ? p.images : [p.image]} texts={p.photoText || []} onDouble={() => doubleTap(p)} onOpen={(k) => { const list = p.images?.length ? p.images : [p.image]; setViewer({ images: list, index: k }); }} />
                {p.song?.url && <PostSong id={p._id} song={p.song} />}
                {p.mine && !p.song?.url && (
                  <button onClick={() => setEditing({ post: p, autoSong: true })} className="absolute z-10 left-3 bottom-3 h-8 pl-2.5 pr-3 rounded-full bg-black/60 backdrop-blur-sm text-white text-[12.5px] flex items-center gap-1.5 active:scale-95"><Music size={14} className="text-[#25D366]" /> Add song</button>
                )}
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
                {p.caption && <Caption name={p.user?.fullName} text={p.caption} />}
                {p.comments > 0 && <button onClick={() => setCommentsFor(p)} className="mt-1 text-[14px] text-white/55 active:opacity-60">View all {p.comments} comment{p.comments === 1 ? "" : "s"}</button>}
                <p className="mt-1 text-[11.5px] text-white/45">{agoLong(p.createdAt)}</p>
                {p.lines && <p className="mt-2 text-[14px] italic text-white/80 whitespace-pre-line break-words border-l-2 border-[#25D366]/70 pl-2.5">{p.lines}</p>}
              </div>
            </article>
          ))}
          {more && <MoreSentinel key={posts.length} onVisible={() => load(false)} />}
          {/* the end of the feed: a plus to add your own post */}
        </>
      )}
      {likersFor && <LikersSheet post={likersFor} onClose={() => setLikersFor(null)} />}
      {editing && <EditPostSheet post={editing.post} autoSong={!!editing.autoSong} onClose={() => setEditing(null)} onSaved={(d) => { setPosts((l) => l.map((x) => (x._id === editing.post._id ? { ...x, ...d } : x))); setEditing(null); toast.success("Saved"); }} />}
      {viewer && <PhotoViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} />}
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
