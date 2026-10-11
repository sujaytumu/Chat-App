import { Palette, X } from "lucide-react";
import { CHAT_COLORS } from "../lib/chatColor";
import { useChatColorStore } from "../store/useChatColorStore";
import { useBackToClose } from "../lib/useBackToClose";

// "Chat colour" for one conversation: pick the colour of your bubbles just here.
const ChatColorSheet = ({ chatKey, chatName, onClose }) => {
  useBackToClose(true, onClose);
  const current = useChatColorStore((s) => s.map[chatKey]);
  const setColor = useChatColorStore((s) => s.setColor);

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/20" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <Palette size={20} className="text-[#00A884]" />
          <h3 className="flex-1 text-[16px] font-medium truncate">Chat colour · {chatName}</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <p className="px-5 text-[12.5px] text-wa-muted">Only for this chat, on this device.</p>
        <div className="flex flex-wrap gap-3 px-5 pt-4">
          <button onClick={() => setColor(chatKey, null)} className="flex flex-col items-center gap-1.5 w-[58px]" aria-pressed={!current}>
            <span className={`size-11 rounded-full border-2 flex items-center justify-center text-[11px] text-wa-muted ${!current ? "border-[#00A884]" : "border-black/10"}`}>
              {!current ? <span className="text-[#00A884] text-[18px] font-bold">✓</span> : "Auto"}
            </span>
            <span className="text-[10.5px] text-wa-muted">Default</span>
          </button>
          {CHAT_COLORS.map((c) => (
            <button key={c.id} onClick={() => setColor(chatKey, c.id)} className="flex flex-col items-center gap-1.5 w-[58px]" aria-pressed={current === c.id}>
              <span
                className={`size-11 rounded-full border-2 flex items-center justify-center transition-transform active:scale-90 ${current === c.id ? "border-[#00A884] scale-105" : "border-black/10"}`}
                style={{ background: c.swatch }}
              >
                {current === c.id && <span className="text-[#00A884] text-[18px] font-bold leading-none">✓</span>}
              </span>
              <span className="text-[10.5px] text-wa-muted truncate w-full text-center">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatColorSheet;
