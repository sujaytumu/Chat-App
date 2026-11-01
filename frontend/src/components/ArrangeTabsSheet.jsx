import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// "Arrange tabs": move the chat-list tabs (All, Unread, Favourites, your own lists…) up or down.
// The new order is applied to the tab row straight away.
const ArrangeTabsSheet = ({ tabs, onMove, onReset, onClose }) => {
  useBackToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-wa-pop text-wa-text rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(18px+env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <ArrowUpDown size={18} className="text-[#00A884]" />
          <h3 className="text-[16px] font-medium">Arrange tabs</h3>
        </div>
        <p className="text-[12.5px] text-wa-muted mb-3">The first one is the first tab you see. Use the arrows to change the order.</p>

        <div className="overflow-y-auto -mx-1 px-1">
          {tabs.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 py-1.5">
              <span className="w-6 text-center text-[12px] text-wa-muted">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-[14.5px]">{t.label}</span>
              <button
                onClick={() => onMove(t.id, -1)}
                disabled={i === 0}
                aria-label={`Move ${t.label} up`}
                className="size-10 rounded-full flex items-center justify-center bg-white/5 active:bg-white/10 disabled:opacity-30"
              >
                <ArrowUp size={18} />
              </button>
              <button
                onClick={() => onMove(t.id, 1)}
                disabled={i === tabs.length - 1}
                aria-label={`Move ${t.label} down`}
                className="size-10 rounded-full flex items-center justify-center bg-white/5 active:bg-white/10 disabled:opacity-30"
              >
                <ArrowDown size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-3 text-[14px]">
          <button onClick={onReset} className="text-wa-muted h-10 px-1">Reset order</button>
          <button onClick={onClose} className="text-[#25D366] h-10 px-1 font-medium">Done</button>
        </div>
      </div>
    </div>
  );
};

export default ArrangeTabsSheet;
