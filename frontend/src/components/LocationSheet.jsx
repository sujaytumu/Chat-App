import { createPortal } from "react-dom";
import { MapPin, Navigation, X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// "Location" in the attach menu: send where I am now, or share it live for a while.
const LocationSheet = ({ allowLive = true, onCurrent, onLive, onClose }) => {
  useBackToClose(true, onClose);
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl pb-[calc(12px+env(safe-area-inset-bottom))] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-[17px] font-semibold">Share location</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>
        <button onClick={onCurrent} className="w-full flex items-center gap-4 px-5 py-3 active:bg-white/5 text-left">
          <span className="size-11 rounded-full bg-[#22c55e] text-white flex items-center justify-center">
            <MapPin size={21} />
          </span>
          <span>
            <span className="block text-[15.5px] font-medium">Send your current location</span>
            <span className="block text-[12.5px] text-wa-muted">Just where you are right now</span>
          </span>
        </button>
        {allowLive && (
          <div className="px-5 pt-2 pb-2">
            <div className="flex items-center gap-4 py-2">
              <span className="size-11 rounded-full bg-[#F15C6D] text-white flex items-center justify-center">
                <Navigation size={20} />
              </span>
              <span>
                <span className="block text-[15.5px] font-medium">Share live location</span>
                <span className="block text-[12.5px] text-wa-muted">Updates while Talkies is open</span>
              </span>
            </div>
            <div className="flex gap-2 pl-[60px]">
              {[
                [15, "15 min"],
                [60, "1 hour"],
                [480, "8 hours"],
              ].map(([m, label]) => (
                <button key={m} onClick={() => onLive(m)} className="flex-1 h-10 rounded-full bg-wa-field text-[13.5px] font-medium active:scale-95 transition-transform">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default LocationSheet;
