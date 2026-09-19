import { useState, useRef, useEffect } from "react";
import { MoreVertical, Pin, PinOff, Trash2, Reply, Copy, Star, Forward, Info } from "lucide-react";
import toast from "react-hot-toast";

// Hover trigger + dropdown for per-message actions, matching WhatsApp's
// long-press/hover message menu.
const MessageActionMenu = ({ message, isMe, visible, authUserId, onTogglePin, onDelete, onReply, onToggleStar, onForward, onInfo }) => {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef(null);
  const isStarred = message.starredBy?.includes(authUserId);

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

  const handleCopy = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text).then(
        () => toast.success("Copied"),
        () => toast.error("Couldn't copy")
      );
    }
    close();
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
          className={`absolute ${isMe ? "right-0" : "left-0"} bottom-full mb-1 bg-[#233138] rounded-xl shadow-2xl py-1.5 w-52 z-20 overflow-hidden max-h-[70vh] overflow-y-auto`}
        >
          {!confirmingDelete ? (
            <>
              <button
                onClick={() => {
                  onReply();
                  close();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                <Reply size={16} />
                Reply
              </button>
              {message.text && (
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
                >
                  <Copy size={16} />
                  Copy
                </button>
              )}
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
                onClick={() => {
                  onToggleStar();
                  close();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                <Star size={16} className={isStarred ? "fill-yellow-400 text-yellow-400" : ""} />
                {isStarred ? "Unstar" : "Star"}
              </button>
              <button
                onClick={() => {
                  onForward();
                  close();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                <Forward size={16} />
                Forward
              </button>
              <button
                onClick={() => {
                  onInfo();
                  close();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
              >
                <Info size={16} />
                Info
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
