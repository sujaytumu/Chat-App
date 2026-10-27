import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Plus, Search, X, ArrowLeft, Loader2, Image as ImageIcon, Send, SmilePlus, Trash2, Megaphone } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { compressImage } from "../lib/imageUtils";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "../components/Avatar";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
};
const msg = (e, fallback) => e?.response?.data?.error || fallback;

const Row = ({ c, onOpen, onFollow }) => (
  <div className="flex items-center gap-3 px-4 py-3 active:bg-white/5" onClick={() => onOpen(c)}>
    <Avatar src={c.icon} name={c.name} size="size-12" textSize="text-xl" />
    <div className="min-w-0 flex-1">
      <p className="text-[15px] text-wa-text truncate">{c.name}</p>
      <p className="text-[12.5px] text-wa-muted truncate">{c.lastPost?.text || c.description || `${c.followerCount} follower${c.followerCount === 1 ? "" : "s"}`}</p>
    </div>
    {onFollow ? (
      <button onClick={(e) => { e.stopPropagation(); onFollow(c); }} className="h-8 px-4 rounded-full bg-[#21C063]/15 text-[#21C063] text-[13px] font-semibold">Follow</button>
    ) : (
      <span className="text-[12px] text-wa-muted shrink-0">{when(c.lastPost?.createdAt)}</span>
    )}
  </div>
);

/* ------------ create a channel ------------ */
const CreateSheet = ({ onClose, onCreated }) => {
  useBackToClose(true, onClose);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    try {
      setIcon(await compressImage(f, { maxDimension: 512, quality: 0.8 }));
    } catch {
      toast.error("Couldn't use that picture");
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const res = await axiosInstance.post("/channels", { name, description, icon: icon || undefined });
      toast.success("Channel created");
      onCreated(res.data);
    } catch (e) {
      toast.error(msg(e, "Couldn't create the channel"));
      setBusy(false);
    }
  };
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-semibold">New channel</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted"><X size={22} /></button>
        </div>
        <button onClick={() => fileRef.current?.click()} className="mx-auto mb-4 size-20 rounded-full bg-wa-field flex items-center justify-center overflow-hidden" aria-label="Channel picture">
          {icon ? <img src={icon} alt="" className="size-full object-cover" /> : <ImageIcon className="text-wa-muted" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Channel name" className="w-full h-12 rounded-2xl bg-wa-field px-4 text-[15px] outline-none placeholder:text-wa-muted" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} placeholder="What is this channel about? (optional)" rows={3} className="mt-3 w-full rounded-2xl bg-wa-field px-4 py-3 text-[14.5px] outline-none placeholder:text-wa-muted resize-none" />
        <p className="mt-2 text-[12px] text-wa-muted">Anyone can find and follow your channel. Only you can post in it.</p>
        <button onClick={create} disabled={busy || name.trim().length < 3} className="mt-4 w-full h-12 rounded-full bg-[#21C063] text-[#0B141A] font-semibold disabled:opacity-40">{busy ? "Creating…" : "Create channel"}</button>
      </div>
    </div>,
    document.body
  );
};

/* ------------ one channel: feed + (owner) composer ------------ */
const ChannelView = ({ channelId, onClose, onChanged }) => {
  useBackToClose(true, onClose);
  const socket = useAuthStore((s) => s.socket);
  const [channel, setChannel] = useState(null);
  const [posts, setPosts] = useState([]); // oldest first
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/channels/${channelId}`);
      setChannel(res.data.channel);
      setPosts([...res.data.posts].reverse());
      setMore(res.data.more);
    } catch (e) {
      toast.error(msg(e, "Couldn't open the channel"));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [channelId, onClose]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [loading, posts.length]);

  useEffect(() => {
    if (!socket) return;
    const onPost = ({ channel: ch, post }) => ch._id === channelId && setPosts((p) => (p.some((x) => x._id === post._id) ? p : [...p, post]));
    const onDel = ({ channelId: cid, postId }) => cid === channelId && setPosts((p) => p.filter((x) => x._id !== postId));
    socket.on("channelPost", onPost);
    socket.on("channelPostDeleted", onDel);
    return () => { socket.off("channelPost", onPost); socket.off("channelPostDeleted", onDel); };
  }, [socket, channelId]);

  const older = async () => {
    try {
      const res = await axiosInstance.get(`/channels/${channelId}`, { params: { before: posts[0]?.createdAt } });
      setPosts((p) => [...[...res.data.posts].reverse(), ...p]);
      setMore(res.data.more);
    } catch { toast.error("Couldn't load older posts"); }
  };
  const follow = async (on) => {
    try {
      if (on) await axiosInstance.post(`/channels/${channelId}/follow`);
      else await axiosInstance.delete(`/channels/${channelId}/follow`);
      setChannel((c) => ({ ...c, isFollowing: on, followerCount: c.followerCount + (on ? 1 : -1) }));
      onChanged();
    } catch (e) { toast.error(msg(e, "Couldn't update")); }
  };
  const react = async (post, emoji) => {
    setPickerFor(null);
    try {
      const res = await axiosInstance.put(`/channels/${channelId}/posts/${post._id}/react`, { emoji });
      setPosts((p) => p.map((x) => (x._id === post._id ? res.data : x)));
    } catch (e) { toast.error(msg(e, "Couldn't react")); }
  };
  const remove = async (post) => {
    try {
      await axiosInstance.delete(`/channels/${channelId}/posts/${post._id}`);
      setPosts((p) => p.filter((x) => x._id !== post._id));
      onChanged();
    } catch (e) { toast.error(msg(e, "Couldn't delete")); }
  };
  const pickImage = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    try { setImage(await compressImage(f, { maxDimension: 1280, quality: 0.78 })); } catch { toast.error("Couldn't use that picture"); }
  };
  const post = async () => {
    setSending(true);
    try {
      const res = await axiosInstance.post(`/channels/${channelId}/posts`, { text, image: image || undefined });
      setPosts((p) => (p.some((x) => x._id === res.data._id) ? p : [...p, res.data]));
      setText(""); setImage(""); onChanged();
    } catch (e) { toast.error(msg(e, "Couldn't post")); } finally { setSending(false); }
  };
  const deleteChannel = async () => {
    if (!window.confirm("Delete this channel and all its posts?")) return;
    try { await axiosInstance.delete(`/channels/${channelId}`); onChanged(); onClose(); toast("Channel deleted"); } catch (e) { toast.error(msg(e, "Couldn't delete")); }
  };

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[150] bg-wa-bg text-wa-text flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3 h-16 px-2 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back" className="size-11 flex items-center justify-center"><ArrowLeft size={22} /></button>
        <Avatar src={channel?.icon} name={channel?.name || ""} size="size-10" textSize="text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium truncate">{channel?.name || "Channel"}</p>
          <p className="text-[12px] text-wa-muted">{channel ? `${channel.followerCount} follower${channel.followerCount === 1 ? "" : "s"}` : ""}</p>
        </div>
        {channel?.isOwner ? (
          <button onClick={deleteChannel} aria-label="Delete channel" className="size-11 flex items-center justify-center text-[#F15C6D]"><Trash2 size={20} /></button>
        ) : channel ? (
          <button onClick={() => follow(!channel.isFollowing)} className={`h-9 px-4 mr-2 rounded-full text-[13px] font-semibold ${channel.isFollowing ? "bg-wa-field text-wa-text" : "bg-[#21C063] text-[#0B141A]"}`}>{channel.isFollowing ? "Following" : "Follow"}</button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" onClick={() => setPickerFor(null)}>
        {loading && <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-wa-muted" /></div>}
        {channel?.description && <p className="text-center text-[12.5px] text-wa-muted px-6">{channel.description}</p>}
        {more && <button onClick={older} className="mx-auto block text-[13px] text-[#21C063] py-1">Load older posts</button>}
        {!loading && posts.length === 0 && <p className="text-center text-wa-muted text-[13.5px] py-10">{channel?.isOwner ? "Write your first post below." : "No posts yet."}</p>}
        {posts.map((p) => (
          <div key={p._id} className="max-w-[88%] rounded-2xl rounded-tl-md bg-wa-surface px-3 pt-2 pb-1.5">
            {p.image && <img src={p.image} alt="" loading="lazy" className="rounded-xl mb-1.5 max-h-80 w-full object-cover" />}
            {p.text && <p className="text-[14.5px] whitespace-pre-wrap break-words">{p.text}</p>}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap relative">
              {Object.entries(p.reactions || {}).map(([emoji, n]) => (
                <button key={emoji} onClick={(e) => { e.stopPropagation(); react(p, emoji); }} className={`h-6 px-2 rounded-full text-[12px] ${p.myReaction === emoji ? "bg-[#21C063]/25" : "bg-white/10"}`}>{emoji} {n}</button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setPickerFor(pickerFor === p._id ? null : p._id); }} aria-label="React" className="size-6 flex items-center justify-center text-wa-muted"><SmilePlus size={16} /></button>
              <span className="ml-auto text-[11px] text-wa-muted">{when(p.createdAt)}</span>
              {channel?.isOwner && <button onClick={() => remove(p)} aria-label="Delete post" className="text-wa-muted"><Trash2 size={14} /></button>}
              {pickerFor === p._id && (
                <div className="absolute -top-10 left-0 flex gap-1 rounded-full bg-wa-pop px-2 py-1 shadow-xl z-10" onClick={(e) => e.stopPropagation()}>
                  {REACTIONS.map((r) => <button key={r} onClick={() => react(p, r)} className="size-8 text-[19px] active:scale-90 transition-transform">{r}</button>)}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {channel?.isOwner && (
        <div className="shrink-0 bg-wa-panel px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))]">
          {image && (
            <div className="relative mb-2 w-24">
              <img src={image} alt="" className="rounded-xl h-24 w-24 object-cover" />
              <button onClick={() => setImage("")} aria-label="Remove photo" className="absolute -top-2 -right-2 size-6 rounded-full bg-black/70 flex items-center justify-center"><X size={14} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={() => fileRef.current?.click()} aria-label="Add photo" className="size-11 shrink-0 rounded-full bg-wa-field flex items-center justify-center"><ImageIcon size={20} /></button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={1} placeholder="Post to your followers" className="flex-1 min-w-0 max-h-32 rounded-3xl bg-wa-field px-4 py-3 text-[14.5px] outline-none placeholder:text-wa-muted resize-none" />
            <button onClick={post} disabled={sending || (!text.trim() && !image)} aria-label="Post" className="size-11 shrink-0 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center disabled:opacity-40">{sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}</button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

/* ------------ the page ------------ */
const ChannelsPage = () => {
  const [data, setData] = useState({ mine: [], discover: [] });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (query = "") => {
    try {
      const res = await axiosInstance.get("/channels", { params: query ? { q: query } : {} });
      setData(res.data);
    } catch (e) {
      toast.error(msg(e, "Couldn't load channels"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const follow = async (c) => {
    try {
      await axiosInstance.post(`/channels/${c._id}/follow`);
      toast.success(`Following ${c.name}`);
      load(q.trim());
    } catch (e) { toast.error(msg(e, "Couldn't follow")); }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-wa-bg overflow-hidden">
      <div className="flex items-center h-14 pl-4 pr-2 shrink-0">
        <h1 className="flex-1 text-[28px] font-bold tracking-tight text-wa-text">Channels</h1>
        <button onClick={() => setCreating(true)} aria-label="New channel" className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10"><Plus size={26} /></button>
      </div>
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 h-11 rounded-full bg-wa-field px-4">
          <Search size={18} className="text-wa-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] placeholder:text-wa-muted" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-6">
        {loading && <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-wa-muted" /></div>}
        {!q && data.mine.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-[13px] text-wa-muted">Following</p>
            {data.mine.map((c) => <Row key={c._id} c={c} onOpen={(x) => setOpenId(x._id)} />)}
          </>
        )}
        {!loading && (
          <>
            <p className="px-4 pt-4 pb-1 text-[13px] text-wa-muted">{q ? "Results" : "Find channels"}</p>
            {data.discover.map((c) => <Row key={c._id} c={c} onOpen={(x) => setOpenId(x._id)} onFollow={follow} />)}
            {data.discover.length === 0 && (
              <div className="px-8 py-10 text-center text-wa-muted text-[13.5px] flex flex-col items-center gap-2">
                <Megaphone size={28} />
                {q ? "No channels match that." : "No channels to discover yet. Create the first one with +."}
              </div>
            )}
          </>
        )}
      </div>
      {openId && <ChannelView channelId={openId} onClose={() => setOpenId(null)} onChanged={() => load(q.trim())} />}
      {creating && <CreateSheet onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); load(); setOpenId(c._id); }} />}
    </div>
  );
};

export default ChannelsPage;
