import { useState, useRef, useEffect } from "react";
import { MoreVertical, Pin, PinOff, Trash2 } from "lucide-react";

// Hover trigger + dropdown for per-message actions: Pin/Unpin, Delete for
// me, Delete for everyone (sender only), Cancel — matching WhatsApp's
// long-press/hover message menu.
const MessageActionMenu = ({ message, isMe, visible, onTogglePin, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => {
    setOpen(false);
    setConfirmingDelete(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((s) => !s)}
        className={`size-6 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10 mb-1 transition-opacity ${
          visible || open ? "opacity-100" : "opacity-0"
        }`}
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div
          className={`absolute ${isMe ? "right-0" : "left-0"} bottom-full mb-1 bg-[#233138] rounded-xl shadow-2xl py-1.5 w-48 z-20 overflow-hidden`}
        >
          {!confirmingDelete ? (
            <>
              <button
                onClick={() => {
                  onTogglePin();
                  close();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                {message.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                {message.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  onDelete("me");
                  close();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                Delete for me
              </button>
              {isMe && (
                <button
                  onClick={() => {
                    onDelete("everyone");
                    close();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5"
                >
                  Delete for everyone
                </button>
              )}
              <button
                onClick={close}
                className="w-full text-left px-4 py-2.5 text-sm text-[#8696A0] hover:bg-white/5 border-t border-white/10"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageActionMenu;
