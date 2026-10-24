import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { optimizeImage } from "../lib/cdn";
import { Search, Send, Check, Link2, Share2, MessageCircle, Users } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

// Instagram-style share sheet: search, a grid of people you can tick, and a row of round action buttons.
const ForwardMessageModal = ({ message, messages, onClose }) => {
  const { users, groups, forwardMessage } = useChatStore();
  const [picked, setPicked] = useState([]); // keys
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);

  const lockedChats = useAuthStore((st) => st.authUser?.lockedChats) || [];
  const items = useMemo(
    () =>
      [
        ...users.map((u) => ({ type: "direct", data: u, key: `d-${u._id}`, name: u.fullName, avatar: u.profilePic })),
        ...groups.map((g) => ({ type: "group", data: g, key: `g-${g._id}`, name: g.name, avatar: g.groupPic })),
      ].filter((i) => !lockedChats.includes(`${i.type === "group" ? "g" : "d"}:${i.data._id}`)),
    [users, groups, lockedChats]
  );
  const shown = q.trim() ? items.filter((i) => (i.name || "").toLowerCase().includes(q.trim().toLowerCase())) : items;

  const list = messages || [message];
  const shareText = list.map((m) => m?.text || m?.file?.name || "").filter(Boolean).join("\n");

  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const handleSend = async () => {
    if (!picked.length || sending) return;
    setSending(true);
    const targets = items.filter((i) => picked.includes(i.key));
    for (const t of targets) for (const m of list) await forwardMessage(m, { type: t.type, data: t.data });
    setSending(false);
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
  const system = async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareText });
      else await copy();
    } catch {
      /* cancelled */
    }
  };

  const actions = [
    shareText && { label: "WhatsApp", icon: <MessageCircle size={26} />, onClick: whatsapp, cls: "bg-[#25D366] text-white" },
    shareText && { label: "Copy", icon: <Link2 size={24} />, onClick: copy, cls: "bg-white/10 text-white" },
    shareText && { label: "Share", icon: <Share2 size={24} />, onClick: system, cls: "bg-white/10 text-white" },
  ].filter(Boolean);

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg h-[78vh] bg-[#1c1f24] text-white rounded-t-3xl flex flex-col shadow-2xl animate-[sheet-up_.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-2.5 pb-2 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-white/30" />
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 h-11 rounded-xl bg-white/10 px-3">
            <Search size={18} className="text-white/60" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-white/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <div className="grid grid-cols-3 gap-y-5 pb-4">
            {shown.map((i) => {
              const on = picked.includes(i.key);
              return (
                <button key={i.key} onClick={() => toggle(i.key)} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                  <span className="relative">
                    <img
                      src={optimizeImage(i.avatar || "/avatar.png", 200)}
                      loading="lazy"
                      decoding="async"
                      alt=""
                      className="size-[76px] rounded-full object-cover bg-white/10"
                    />
                    {i.type === "group" && (
                      <span className="absolute -bottom-0.5 -left-0.5 size-6 rounded-full bg-[#1c1f24] flex items-center justify-center">
                        <Users size={13} />
                      </span>
                    )}
                    {on && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-[#0095f6] border-2 border-[#1c1f24] flex items-center justify-center">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="text-[14px] leading-tight text-center line-clamp-2 break-words px-1 max-w-[110px]">{i.name}</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="col-span-3 text-center text-white/50 py-10 text-sm">No chats found</p>}
          </div>
        </div>

        <div className="border-t border-white/10 px-3 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
          {picked.length > 0 ? (
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full h-12 rounded-xl bg-[#0095f6] active:bg-[#1877d6] text-white font-medium text-[16px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Send size={18} /> {sending ? "Sending…" : picked.length > 1 ? `Send to ${picked.length}` : "Send"}
            </button>
          ) : (
            <div className="flex gap-5 overflow-x-auto no-scrollbar px-1">
              {actions.map((a) => (
                <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5 shrink-0 w-16 active:scale-95 transition-transform">
                  <span className={`size-14 rounded-full flex items-center justify-center ${a.cls}`}>{a.icon}</span>
                  <span className="text-[13px]">{a.label}</span>
                </button>
              ))}
              {actions.length === 0 && <p className="text-white/50 text-sm py-3 mx-auto">Pick people to send to</p>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ForwardMessageModal;
