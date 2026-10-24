import { useState } from "react";
import { Send, Check, Link2, Search, Share2, MessageCircle, Users } from "lucide-react";
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

  const reelUrl = `${window.location.origin}/reels?r=${reel._id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reelUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Watch this reel on Talkies ${reelUrl}`)}`, "_blank", "noopener");
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

  const actions = [
    { label: "WhatsApp", icon: <MessageCircle size={26} />, onClick: whatsapp, cls: "bg-[#25D366] text-white" },
    { label: "Copy link", icon: <Link2 size={24} />, onClick: copyLink, cls: "bg-white/10 text-white" },
    { label: "Share", icon: <Share2 size={24} />, onClick: link, cls: "bg-white/10 text-white" },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full h-[75%] bg-[#1c1f24] text-white rounded-t-3xl flex flex-col overflow-hidden animate-[sheet-up_.22s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="pt-2.5 pb-2 flex justify-center"><span className="h-1 w-10 rounded-full bg-white/30" /></div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 h-11 rounded-xl bg-white/10 px-3">
            <Search size={18} className="text-white/60" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-white/50" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <div className="grid grid-cols-3 gap-y-5 pb-4">
            {items.map((i) => (
              <button key={i.key} onClick={() => toggle(i.key)} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                <span className="relative">
                  <img src={optimizeImage(i.avatar || "/avatar.png", 200)} alt="" loading="lazy" decoding="async" className="size-[76px] rounded-full object-cover bg-white/10" />
                  {i.type === "group" && <span className="absolute -bottom-0.5 -left-0.5 size-6 rounded-full bg-[#1c1f24] flex items-center justify-center"><Users size={13} /></span>}
                  {picked.has(i.key) && <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-[#0095f6] border-2 border-[#1c1f24] flex items-center justify-center"><Check size={14} strokeWidth={3} /></span>}
                </span>
                <span className="text-[14px] leading-tight text-center line-clamp-2 break-words px-1 max-w-[110px]">{i.name}</span>
              </button>
            ))}
            {!items.length && <p className="col-span-3 text-center text-white/50 py-10 text-sm">No chats found</p>}
          </div>
        </div>
        <div className="border-t border-white/10 px-3 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
          {picked.size > 0 ? (
            <button onClick={send} disabled={sending} className="w-full h-12 rounded-xl bg-[#0095f6] active:bg-[#1877d6] text-white font-medium text-[16px] flex items-center justify-center gap-2 disabled:opacity-60">
              <Send size={18} /> {sending ? "Sending…" : picked.size > 1 ? `Send to ${picked.size}` : "Send"}
            </button>
          ) : (
            <div className="flex gap-5 overflow-x-auto no-scrollbar px-1">
              {actions.map((a) => (
                <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5 shrink-0 w-16 active:scale-95 transition-transform">
                  <span className={`size-14 rounded-full flex items-center justify-center ${a.cls}`}>{a.icon}</span>
                  <span className="text-[13px]">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendReelModal;
