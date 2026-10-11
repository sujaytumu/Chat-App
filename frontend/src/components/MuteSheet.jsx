import { useState } from "react";
import { BellOff } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const OPTIONS = [
  ["8 hours", 8 * 3600 * 1000],
  ["1 week", 7 * 24 * 3600 * 1000],
  ["Always", null],
];

// "Mute notifications" duration picker, like WhatsApp.
const MuteSheet = ({ name, onPick, onClose }) => {
  useBackToClose(true, onClose);
  const [sel, setSel] = useState(2);

  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-xs bg-wa-pop text-wa-text rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(18px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <BellOff size={18} className="text-[#00A884]" />
          <h3 className="text-[16px] font-medium truncate">Mute {name || "notifications"}</h3>
        </div>
        <p className="text-[12.5px] text-wa-muted mb-3">No sound or pop-ups for new messages from this chat.</p>
        {OPTIONS.map(([label], i) => (
          <button key={label} onClick={() => setSel(i)} className="w-full flex items-center gap-4 py-3 text-left">
            <span className={`size-5 rounded-full border-2 flex items-center justify-center ${sel === i ? "border-[#00A884]" : "border-wa-muted/60"}`}>
              {sel === i && <span className="size-2.5 rounded-full bg-[#00A884]" />}
            </span>
            <span className="text-[14.5px]">{label}</span>
          </button>
        ))}
        <div className="flex justify-end gap-6 mt-3 text-[14px]">
          <button onClick={onClose} className="text-[#25D366] h-10 px-1">Cancel</button>
          <button
            onClick={() => {
              const ms = OPTIONS[sel][1];
              onPick(ms ? new Date(Date.now() + ms).toISOString() : null);
            }}
            className="text-[#25D366] h-10 px-1 font-medium"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default MuteSheet;
