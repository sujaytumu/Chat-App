import { useState } from "react";
import Avatar from "./Avatar";
import { useBackToClose } from "../lib/useBackToClose";

// "Who reacted" bottom sheet, like WhatsApp: All / per-emoji tabs, tap your own to remove it.
const ReactionsSheet = ({ message, resolveUser, meId, onRemove, onClose }) => {
  useBackToClose(true, onClose);
  const reactions = message.reactions || [];
  const counts = reactions.reduce((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] || 0) + 1 }), {});
  const [tab, setTab] = useState("all");
  const shown = tab === "all" ? reactions : reactions.filter((r) => r.emoji === tab);

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[70%] bg-wa-panel text-wa-text rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/20" />
        <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto">
          {[["all", `All ${reactions.length}`], ...Object.entries(counts).map(([e, n]) => [e, `${e} ${n}`])].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`shrink-0 px-3.5 h-9 rounded-full text-[13px] ${tab === k ? "bg-[#00A884]/20 text-[#00A884] font-medium" : "text-wa-muted hover:bg-white/5"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto pb-3">
          {shown.map((r) => {
            const mine = String(r.user) === String(meId);
            const u = resolveUser(r.user);
            return (
              <button
                key={`${r.user}-${r.emoji}`}
                disabled={!mine}
                onClick={() => {
                  onRemove(r.emoji);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-left enabled:hover:bg-white/5"
              >
                <Avatar src={u?.profilePic} name={u?.fullName || "?"} size="size-10" textSize="text-base" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] truncate">{mine ? "You" : u?.fullName || "Someone"}</span>
                  {mine && <span className="block text-[11.5px] text-wa-muted">Tap to remove</span>}
                </span>
                <span className="text-[22px] leading-none">{r.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReactionsSheet;
