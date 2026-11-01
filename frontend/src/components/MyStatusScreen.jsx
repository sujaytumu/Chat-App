import { useState } from "react";
import { ArrowLeft, MoreVertical, Heart, Pencil, Camera, Lock, Trash2, Eye, Bookmark, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import { statusPreview } from "./StatusCard";

const whenLabel = (iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? `Today, ${t}` : days === 1 ? `Yesterday, ${t}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${t}`;
};

// "My status" page like WhatsApp: every update you posted with its views and hearts, a ⋮ menu on each, and the two round buttons.
const MyStatusScreen = ({ statuses, onClose, onOpen, onHighlight, onDeleted, onText, onPhoto }) => {
  useBackToClose(true, onClose);
  const [menu, setMenu] = useState(null); // { st, index }
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (!menu) return;
    setBusy(true);
    try {
      await axiosInstance.delete(`/status/${menu.st._id}`);
      toast.success("Status deleted");
      onDeleted(menu.st._id);
      setMenu(null);
      setConfirm(false);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-wa-bg text-wa-text flex flex-col">
      <div className="flex items-center gap-4 px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3 border-b border-white/10 shrink-0">
        <button onClick={onClose} aria-label="Back" className="size-10 -ml-2 flex items-center justify-center rounded-full active:bg-white/10"><ArrowLeft size={26} /></button>
        <h1 className="text-[22px] font-normal">My status</h1>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {[...statuses].reverse().map((st) => {
          const index = statuses.indexOf(st);
          const pv = statusPreview(st);
          const views = Math.max((st.views || []).filter((v) => v.user).length, st.viewedBy?.length || 0);
          const hearts = new Set((st.likes || []).filter((l) => l.user).map((l) => l.user._id || l.user)).size;
          return (
            <div key={st._id} className="flex items-center gap-4 px-4 py-3.5 border-b border-white/10 active:bg-white/5" onClick={() => onOpen(index)}>
              <div className="size-[72px] rounded-full overflow-hidden shrink-0 border-2 border-[#21C063]/70 bg-wa-surface flex items-center justify-center">
                {pv.kind === "image" ? <img src={pv.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : pv.kind === "text" ? <div className="w-full h-full flex items-center justify-center p-1 text-[9px] font-semibold text-white text-center overflow-hidden" style={{ background: pv.color }}><span className="line-clamp-3 break-words">{pv.text}</span></div>
                  : <div className="w-full h-full bg-gradient-to-br from-[#1f3a34] to-[#0f1b22]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-2 text-[19px] leading-6">
                  {views} {views === 1 ? "view" : "views"}
                  {hearts > 0 && <><span className="text-wa-muted">•</span><Heart size={20} className="text-[#21C063]" fill="currentColor" strokeWidth={0} /></>}
                </p>
                <p className="text-[15.5px] text-wa-muted">{whenLabel(st.createdAt)}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setConfirm(false); setMenu({ st, index }); }} aria-label="More" className="size-10 rounded-full flex items-center justify-center active:bg-white/10"><MoreVertical size={22} /></button>
            </div>
          );
        })}
        <p className="flex items-center justify-center gap-1.5 px-8 pt-10 pb-40 text-[14px] text-wa-muted text-center leading-snug">
          <Lock size={14} className="shrink-0" /> <span>Your statuses are <span className="text-[#21C063] font-medium">end-to-end encrypted</span>. They will disappear after 24 hours.</span>
        </p>
      </div>

      <div className="absolute right-4 bottom-[calc(24px+env(safe-area-inset-bottom))] flex flex-col items-center gap-3.5">
        <button onClick={onText} className="size-12 rounded-2xl bg-wa-field text-wa-icon shadow-lg flex items-center justify-center active:scale-95" aria-label="Text status"><Pencil size={20} /></button>
        <button onClick={onPhoto} className="size-14 rounded-[20px] bg-[#21C063] text-black shadow-xl shadow-[#21C063]/30 flex items-center justify-center active:scale-95" aria-label="Photo status"><Camera size={24} /></button>
      </div>

      {menu && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50" onClick={() => setMenu(null)}>
          <div className="w-full rounded-t-3xl bg-wa-pop pb-[calc(10px+env(safe-area-inset-bottom))] pt-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { const i = menu.index; setMenu(null); onOpen(i); }} className="w-full flex items-center gap-4 px-6 h-14 text-[16.5px] active:bg-white/5"><Eye size={21} className="text-wa-icon" /> View</button>
            <button onClick={() => { const st = menu.st; setMenu(null); onHighlight(st); }} className="w-full flex items-center gap-4 px-6 h-14 text-[16.5px] active:bg-white/5"><Bookmark size={21} className="text-wa-icon" /> Add to highlight</button>
            {confirm ? (
              <div className="px-6 pt-2 pb-2">
                <p className="text-[14.5px] text-wa-muted pb-3">Delete this status? This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirm(false)} className="flex-1 h-12 rounded-full bg-wa-field text-[15.5px]">Cancel</button>
                  <button onClick={del} disabled={busy} className="flex-1 h-12 rounded-full bg-red-500 text-white font-semibold text-[15.5px] flex items-center justify-center gap-2 disabled:opacity-60">{busy ? <Loader2 size={18} className="animate-spin" /> : "Delete"}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)} className="w-full flex items-center gap-4 px-6 h-14 text-[16.5px] text-red-400 active:bg-white/5"><Trash2 size={21} /> Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyStatusScreen;
