import { useState } from "react";
import { X, Send, Check, Link2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { reelMessageText } from "../lib/messageFormat";

// Pick one or more chats and send the reel into them (it shows as a tappable reel card).
const SendReelModal = ({ reel, onClose }) => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const locked = useAuthStore((s) => s.authUser?.lockedChats) || [];
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);

  const items = [
    ...users.map((u) => ({ key: `d:${u._id}`, type: "direct", id: u._id, name: u.fullName, avatar: u.profilePic })),
    ...groups.map((g) => ({ key: `g:${g._id}`, type: "group", id: g._id, name: g.name, avatar: g.groupPic })),
  ]
    .filter((i) => !locked.includes(i.key))
    .filter((i) => !q.trim() || i.name?.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (k) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const send = async () => {
    if (!picked.size || sending) return;
    setSending(true);
    const text = reelMessageText(reel);
    const targets = items.filter((i) => picked.has(i.key));
    const results = await Promise.allSettled(
      targets.map((t) => axiosInstance.post(t.type === "direct" ? `/messages/send/${t.id}` : `/groups/${t.id}/messages`, { text }))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ok) toast.success(ok === 1 ? "Reel sent" : `Reel sent to ${ok} chats`);
    if (ok < targets.length) toast.error("Some chats didn't get it");
    setSending(false);
    if (ok) onClose();
  };

  const link = async () => {
    const url = `${window.location.origin}/reels?r=${reel._id}`;
    try {
      if (navigator.share) await navigator.share({ url, title: "Talkies reel" });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full max-h-[78%] bg-wa-surface rounded-t-3xl flex flex-col overflow-hidden wa-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-semibold text-wa-text text-[16px]">Send to</h3>
          <button onClick={onClose} className="text-wa-muted"><X size={20} /></button>
        </div>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 bg-wa-field rounded-full px-3 py-2">
            <Search size={16} className="text-wa-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="bg-transparent outline-none flex-1 text-[14px] text-wa-text placeholder:text-wa-muted" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.map((i) => (
            <button key={i.key} onClick={() => toggle(i.key)} className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-white/5">
              <div className="relative">
                <img src={optimizeImage(i.avatar || "/avatar.png", 120)} alt="" className="size-11 rounded-full object-cover" loading="lazy" />
                {picked.has(i.key) && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-[#25D366] text-black flex items-center justify-center border-2 border-wa-surface"><Check size={12} strokeWidth={3} /></span>
                )}
              </div>
              <span className="text-wa-text truncate text-[15px]">{i.name}</span>
            </button>
          ))}
          {!items.length && <p className="text-center text-wa-muted py-8 text-sm">No chats found</p>}
        </div>
        <div className="flex items-center gap-3 p-4 border-t border-white/10 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button onClick={link} className="size-12 rounded-full bg-wa-field text-wa-text flex items-center justify-center" aria-label="Share link"><Link2 size={20} /></button>
          <button onClick={send} disabled={!picked.size || sending} className="flex-1 h-12 rounded-full bg-[#25D366] text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            <Send size={18} /> {sending ? "Sending…" : picked.size ? `Send (${picked.size})` : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendReelModal;
