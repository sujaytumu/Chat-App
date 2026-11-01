import { createPortal } from "react-dom";
import { ArrowLeft, Camera, Heart, Lock, Pencil } from "lucide-react";
import StatusThumb from "./StatusThumb";
import { useBackToClose } from "../lib/useBackToClose";

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
export const statusWhen = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86400000);
  return `${diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${clock(iso)}`;
};

// "My status", like WhatsApp: the updates you already have (with views and hearts), kept apart from the
// buttons that add a new one. Tap an update to watch it from there on.
const MyStatusSheet = ({ statuses, onOpen, onAdd, onClose }) => {
  useBackToClose(true, onClose);
  const newestFirst = statuses.map((s, i) => ({ s, i })).reverse();

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[140] bg-wa-bg text-wa-text flex flex-col">
      <div className="flex items-center gap-4 px-3 h-16 shrink-0 border-b border-white/5">
        <button onClick={onClose} className="size-10 rounded-full flex items-center justify-center hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-[20px] font-medium">My status</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* adding a new update is its own thing, above the ones you already have */}
        <button onClick={() => onAdd("image")} className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/5 active:bg-white/10">
          <span className="size-14 rounded-full bg-[#00A884] text-white flex items-center justify-center shrink-0">
            <Camera size={24} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-medium">Add to my status</span>
            <span className="block text-[13px] text-wa-muted">Photo or video</span>
          </span>
        </button>
        <button onClick={() => onAdd("text")} className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/5 active:bg-white/10">
          <span className="size-14 rounded-full bg-wa-field text-wa-icon flex items-center justify-center shrink-0">
            <Pencil size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-medium">Text status</span>
            <span className="block text-[13px] text-wa-muted">Write something</span>
          </span>
        </button>

        <p className="px-4 pt-4 pb-1 text-[12.5px] font-semibold uppercase tracking-wide text-wa-muted">Your updates · {statuses.length}</p>
        <div className="border-t border-white/5">
          {newestFirst.map(({ s, i }) => {
            const views = Math.max((s.views || []).filter((v) => v.user).length, s.viewedBy?.length || 0);
            const hearts = (s.likes || []).length;
            return (
              <button key={s._id} onClick={() => onOpen(statuses.slice(i))} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 border-b border-white/5">
                <span className="size-14 rounded-full overflow-hidden shrink-0 ring-2 ring-[#00A884] ring-offset-2 ring-offset-wa-bg">
                  <StatusThumb s={s} width={120} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 text-[16px] font-medium">
                    {views} {views === 1 ? "view" : "views"}
                    {hearts > 0 && (
                      <span className="flex items-center gap-1 text-[#25D366] text-[14px]">
                        <Heart size={14} fill="currentColor" /> {hearts}
                      </span>
                    )}
                  </span>
                  <span className="block text-[13.5px] text-wa-muted">{statusWhen(s.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="flex items-center justify-center gap-1.5 px-6 pt-6 pb-24 text-[12px] text-wa-muted text-center">
          <Lock size={13} className="shrink-0" /> Your statuses are <span className="text-[#00A884]">end-to-end encrypted</span>. They disappear after 24 hours.
        </p>
      </div>
    </div>,
    document.body
  );
};

export default MyStatusSheet;
