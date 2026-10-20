import { useState } from "react";
import toast from "react-hot-toast";
import { isPinned } from "../lib/pin";
import { Camera } from "lucide-react";
import ContextMenu, { ConfirmDialog } from "./ContextMenu";
import { Reply, Copy, Pin, PinOff, Star, StarOutline, Forward, Info, Languages, Pencil, Trash2 } from "./icons/WaGlyphs";
import { WaCheck as Check } from "./icons/WaIcons";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// WhatsApp Web's message menu: a row of quick reactions above a list (Info, Reply, Copy, Forward, Pin, Star, Delete…).
// Opens from the little arrow on a bubble, or a right-click. `menu` carries the message actions from ChatContainer.
const MessageContextMenu = ({ message, isMe, authUserId, menu, x, y, align, onClose }) => {
  const [stage, setStage] = useState("menu"); // "menu" | "delete"
  const starred = !!message.starredBy?.includes(authUserId);
  const mine = (message.reactions || []).find((r) => String(r.user) === String(authUserId))?.emoji;

  if (stage === "delete") {
    return (
      <ConfirmDialog
        title="Delete message?"
        body={isMe ? "You can delete it just for yourself, or for everyone in this chat." : "It will be removed from your device only. The other person keeps it."}
        actions={[
          ...(isMe && !message.deletedForEveryone ? [{ label: "Delete for everyone", onClick: () => menu.onDelete("everyone") }] : []),
          { label: "Delete for me", onClick: () => menu.onDelete("me") },
        ]}
        onClose={onClose}
      />
    );
  }

  const reactions = (
    <div className="flex items-center gap-0.5 rounded-full bg-wa-pop px-2 py-1.5" style={{ boxShadow: "0 8px 28px -6px rgb(0 0 0 / .4), 0 0 0 1px rgb(128 128 128 / .12)" }}>
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => {
            menu.onReact(e);
            onClose();
          }}
          className={`size-9 rounded-full text-[22px] leading-none flex items-center justify-center hover:scale-125 transition-transform ${mine === e ? "bg-wa-surface" : ""}`}
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );

  const items = [
    { label: "Message info", icon: Info, onClick: menu.onInfo },
    { label: "Reply", icon: Reply, onClick: menu.onReply },
    { label: "Reply with photo", icon: Camera, hidden: !menu.onReplyPhoto || message.deletedForEveryone, onClick: menu.onReplyPhoto },
    {
      label: "Copy",
      icon: Copy,
      hidden: !message.text,
      onClick: () =>
        navigator.clipboard.writeText(message.text).then(
          () => toast.success("Copied"),
          () => toast.error("Couldn't copy")
        ),
    },
    { label: "Forward", icon: Forward, hidden: !!message.viewOnce || !!message.poll || !!message.event, onClick: menu.onForward },
    { label: isPinned(message) ? "Unpin" : "Pin", icon: isPinned(message) ? PinOff : Pin, onClick: menu.onTogglePin },
    { label: starred ? "Unstar" : "Star", icon: starred ? Star : StarOutline, onClick: menu.onToggleStar },
    { label: "Edit", icon: Pencil, hidden: !menu.onEdit, onClick: menu.onEdit },
    { label: "Translate", icon: Languages, hidden: !menu.onTranslate, onClick: menu.onTranslate },
    { label: "Select messages", icon: Check, onClick: menu.onSelect, divider: true },
    { label: "Delete", icon: Trash2, keepOpen: true, onClick: () => setStage("delete") },
  ];

  return <ContextMenu x={x} y={y} align={align} top={reactions} items={items} onClose={onClose} />;
};

export default MessageContextMenu;
