import { createPortal } from "react-dom";
import { X, Send } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen photo preview before sending, like WhatsApp: big picture, caption bar with the
// "view once" (1) switch, who it goes to, and a green send button.
const PhotoSendPreview = ({ src, caption, onCaption, canViewOnce, viewOnce, onToggleViewOnce, to, sending, onSend, onClose }) => {
  useBackToClose(true, onClose);
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[170] bg-black text-white flex flex-col">
      <div className="flex items-center justify-between px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2 shrink-0">
        <button type="button" onClick={onClose} aria-label="Close" className="size-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-1">
        <img src={src} alt="Preview" className="max-w-full max-h-full object-contain" draggable={false} />
      </div>

      <div className="shrink-0 px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        {viewOnce && <p className="text-center text-[12.5px] text-white/70 pb-2">They can open this photo only once</p>}
        <div className="flex items-end gap-2 rounded-[26px] bg-[#1f2c34] pl-4 pr-2 py-1.5">
          <textarea
            value={caption}
            onChange={(e) => onCaption(e.target.value)}
            rows={1}
            placeholder="Add a caption…"
            className="flex-1 bg-transparent outline-none resize-none py-2.5 text-[16px] placeholder:text-white/50 max-h-28"
          />
          {canViewOnce && (
            <button
              type="button"
              onClick={onToggleViewOnce}
              aria-pressed={viewOnce}
              aria-label="View once"
              className={`size-10 mb-0.5 rounded-full flex items-center justify-center transition-colors ${viewOnce ? "bg-[#25D366] text-black" : "text-white/80"}`}
            >
              <span className="size-[22px] rounded-full border-2 border-dashed border-current text-[11px] font-bold flex items-center justify-center">1</span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="max-w-[70%] truncate rounded-full bg-[#1f2c34] px-4 py-2 text-[14px]">{to}</span>
          <button type="button" onClick={onSend} disabled={sending} aria-label="Send" className="size-14 rounded-full bg-[#25D366] text-black flex items-center justify-center shadow-lg disabled:opacity-60 active:scale-95 transition-transform">
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PhotoSendPreview;
