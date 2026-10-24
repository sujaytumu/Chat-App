import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const OPTIONS = [
  [8, "8 hours"],
  [24, "24 hours"],
  [168, "7 days"],
];

// WhatsApp's "Choose how long your pin lasts"
const PinDurationSheet = ({ message, onClose }) => {
  const pick = (hours) => {
    onClose();
    useChatStore.getState().togglePinMessage(message._id, hours);
  };
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[310] bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[22rem] rounded-2xl bg-wa-pop text-wa-text p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-[17px] font-medium">
          <Pin size={18} /> Choose how long your pin lasts
        </h3>
        <p className="text-[13px] text-wa-muted mt-1">You can unpin at any time.</p>
        <div className="mt-4 flex flex-col">
          {OPTIONS.map(([h, label]) => (
            <button key={h} onClick={() => pick(h)} className="flex items-center gap-3 py-3 text-left text-[15px] hover:bg-white/5 rounded-lg px-2">
              <span className="size-5 rounded-full border-2 border-wa-muted" />
              {label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 ml-auto block h-10 px-5 rounded-full text-[#21C063] text-[14px] font-medium hover:bg-white/5">
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
};

export default PinDurationSheet;
