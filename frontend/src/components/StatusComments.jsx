import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Loader2, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useAuthStore } from "../store/useAuthStore";

// Instagram-style comments under a status update or a highlight item:
// a bottom sheet with the list, one level of replies, a heart on every comment and a quick-emoji row.

const QUICK = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"];

// "now", "5m", "3h", "2d", "4w" — short like Instagram
const short = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
};

const Avatar = ({ user, size }) => (
  <img src={optimizeImage(user?.profilePic || "/avatar.png", 96)} loading="lazy" decoding="async" alt="" className={`${size} rounded-full object-cover shrink-0`} />
);

const Row = ({ c, isReply, meId, ownerId, onReply, onLike, onDelete }) => {
  const canDelete = String(c.user?._id) === String(meId) || String(ownerId) === String(meId);
  return (
    <div className={`flex gap-3 ${isReply ? "pl-12 pt-3" : "pt-4"}`}>
      <Avatar user={c.user} size={isReply ? "size-7" : "size-9"} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-wa-text break-words">
          <span className="font-semibold mr-1.5">{c.user?.fullName || "Someone"}</span>
          <span className="text-wa-muted text-[12px]">{short(c.createdAt)}</span>
        </p>
        <p className="text-[14px] text-wa-text break-words whitespace-pre-wrap">{c.text}</p>
        <div className="flex items-center gap-4 mt-1 text-[12px] text-wa-muted">
          <button onClick={() => onReply(c)} className="font-medium active:opacity-60">
            Reply
          </button>
          {canDelete && (
            <button onClick={() => onDelete(c)} className="flex items-center gap-1 active:opacity-60" aria-label="Delete comment">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>
      <button onClick={() => onLike(c)} className="shrink-0 flex flex-col items-center gap-0.5 pt-1 w-8 active:scale-90 transition-transform" aria-label={c.liked ? "Unlike comment" : "Like comment"}>
        <Heart size={16} className={c.liked ? "text-[#FF3B5C]" : "text-wa-muted"} fill={c.liked ? "currentColor" : "none"} />
        {c.likeCount > 0 && <span className="text-[11px] text-wa-muted leading-none">{c.likeCount}</span>}
      </button>
    </div>
  );
};

// targetId: the status id, or the highlight item id. onTotal(n) keeps the count on the viewer's icon up to date.
const StatusComments = ({ targetId, onClose, onTotal }) => {
  const me = useAuthStore((s) => s.authUser);
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [ownerId, setOwnerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null); // the comment being answered
  const [open, setOpen] = useState(() => new Set()); // comments whose replies are showing
  const [sending, setSending] = useState(false);
  const input = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get(`/status-comments/${targetId}`);
      setComments(data.comments || []);
      setTotal(data.total || 0);
      setOwnerId(data.ownerId);
      onTotal?.(data.total || 0);
    } catch {
      toast.error("Couldn't load comments");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  useEffect(() => {
    load();
  }, [load]);

  // someone commented while this is open
  useEffect(() => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return undefined;
    const onNew = (p) => {
      if (String(p?.targetId) === String(targetId)) load();
    };
    socket.on("statusComment", onNew);
    return () => socket.off("statusComment", onNew);
  }, [targetId, load]);

  const startReply = (c) => {
    setReplyTo(c);
    setText(`@${c.user?.fullName || ""} `);
    input.current?.focus();
  };

  const post = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      // a reply to a reply goes under the original comment
      const parent = replyTo ? comments.find((c) => c._id === replyTo._id || c.replies?.some((r) => r._id === replyTo._id)) : null;
      await axiosInstance.post(`/status-comments/${targetId}`, { text: t, parentId: replyTo?._id });
      setText("");
      setReplyTo(null);
      if (parent) setOpen((o) => new Set(o).add(parent._id));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't post the comment");
    } finally {
      setSending(false);
    }
  };

  const like = async (c) => {
    const next = !c.liked;
    const patch = (x) => (x._id === c._id ? { ...x, liked: next, likeCount: Math.max(0, x.likeCount + (next ? 1 : -1)) } : x);
    setComments((list) => list.map((x) => ({ ...patch(x), replies: (x.replies || []).map(patch) })));
    try {
      await axiosInstance.put(`/status-comments/like/${c._id}`, { liked: next });
    } catch {
      load();
    }
  };

  const remove = async (c) => {
    try {
      await axiosInstance.delete(`/status-comments/${c._id}`);
      if (replyTo?._id === c._id) setReplyTo(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't delete the comment");
    }
  };

  const toggle = (id) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-end" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-md mx-auto h-[72%] bg-wa-panel rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="relative flex items-center justify-center px-5 py-3 border-b border-white/5">
          <h3 className="text-[15px] font-semibold text-wa-text">Comments{total > 0 ? ` · ${total}` : ""}</h3>
          <button onClick={onClose} className="absolute right-4 text-wa-muted" aria-label="Close comments">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {loading ? (
            <div className="flex justify-center py-12 text-wa-muted">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-[18px] font-semibold text-wa-text">No comments yet</p>
              <p className="text-[13px] text-wa-muted mt-1">Start the conversation.</p>
            </div>
          ) : (
            comments.map((c) => {
              const replies = c.replies || [];
              const shown = open.has(c._id);
              return (
                <div key={c._id}>
                  <Row c={c} meId={me?._id} ownerId={ownerId} onReply={startReply} onLike={like} onDelete={remove} />
                  {replies.length > 0 && (
                    <button onClick={() => toggle(c._id)} className="pl-12 pt-2 flex items-center gap-2 text-[12px] text-wa-muted font-medium active:opacity-60">
                      <span className="w-6 border-t border-wa-muted/50" />
                      {shown ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                    </button>
                  )}
                  {shown && replies.map((r) => <Row key={r._id} c={r} isReply meId={me?._id} ownerId={ownerId} onReply={startReply} onLike={like} onDelete={remove} />)}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-white/5">
          {replyTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 text-[12px] text-wa-muted">
              <span className="truncate">Replying to {replyTo.user?.fullName}</span>
              <button
                onClick={() => {
                  setReplyTo(null);
                  setText("");
                }}
                aria-label="Cancel reply"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="flex justify-between px-4 pt-2.5 text-[22px] leading-none">
            {QUICK.map((e) => (
              <button key={e} type="button" onClick={() => setText((t) => t + e)} className="active:scale-125 transition-transform" aria-label={`Add ${e}`}>
                {e}
              </button>
            ))}
          </div>
          <form onSubmit={post} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar user={me} size="size-9" />
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Add a comment…"
              className="flex-1 h-10 rounded-full bg-white/10 px-4 text-[14px] text-wa-text placeholder:text-wa-muted outline-none"
            />
            <button type="submit" disabled={!text.trim() || sending} className="text-[14px] font-semibold text-[#3897F0] disabled:opacity-40">
              {sending ? <Loader2 size={18} className="animate-spin" /> : "Post"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StatusComments;
