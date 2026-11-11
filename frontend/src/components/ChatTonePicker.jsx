import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";
import { MESSAGE_TONES, getChatTone, setChatTone } from "../lib/soundSettings";
import { previewMessageTone, stopTonePreview } from "../lib/notificationSound";

// "Notification tone" for one chat: Default (the app-wide tone), Silent, or one of the built-in tones.
// Tapping a tone plays it; OK saves. Used by the contact and group info screens.
const OPTIONS = [{ id: "default", label: "Default (same as other chats)" }, { id: "none", label: "Silent" }, ...MESSAGE_TONES];

const ChatTonePicker = ({ chatKey, name, onClose, onSaved }) => {
  useBackToClose(true, onClose);
  const [sel, setSel] = useState(getChatTone(chatKey) || "default");
  useEffect(() => stopTonePreview, []);

  const pick = (id) => {
    setSel(id);
    if (id === "default" || id === "none") stopTonePreview();
    else previewMessageTone(id, "message");
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-xs bg-wa-pop text-wa-text rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(18px+env(safe-area-inset-bottom))] max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <Music size={18} className="text-[#00A884]" />
          <h3 className="text-[16px] font-medium truncate">Notification tone{name ? ` · ${name}` : ""}</h3>
        </div>
        <p className="text-[12.5px] text-wa-muted mb-2">Plays when this chat sends you a message while the app is open.</p>
        <div className="overflow-y-auto -mx-1 px-1 flex-1">
          {OPTIONS.map((o) => (
            <button key={o.id} onClick={() => pick(o.id)} className="w-full flex items-center gap-4 py-3 text-left">
              <span className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${sel === o.id ? "border-[#00A884]" : "border-wa-muted/60"}`}>
                {sel === o.id && <span className="size-2.5 rounded-full bg-[#00A884]" />}
              </span>
              <span className="text-[14.5px]">{o.label}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="h-10 px-4 rounded-full text-[#00A884] font-medium hover:bg-white/5">Cancel</button>
          <button
            onClick={() => {
              setChatTone(chatKey, sel === "default" ? null : sel);
              onSaved?.();
              onClose();
            }}
            className="h-10 px-4 rounded-full text-[#00A884] font-medium hover:bg-white/5"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatTonePicker;
