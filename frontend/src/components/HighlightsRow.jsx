import { useRef } from "react";
import { Plus, Play, Headphones, FileText, Bookmark } from "lucide-react";
import { optimizeImage } from "../lib/cdn";
import { HL_GRADIENT, HL_ACCENT, HL_ACCENT_SOFT } from "../lib/highlightTheme";

// A small picture of one update (a saved status or a status being picked): photo, colour card for text, icon otherwise.
export const UpdateThumb = ({ item, size = 160, className = "" }) => {
  if (!item) return <div className={`flex items-center justify-center text-white ${className}`} style={{ background: HL_GRADIENT }}><Bookmark size={22} /></div>;
  if (item.type === "image") {
    return <img src={optimizeImage(item.content, size)} loading="lazy" decoding="async" alt="" className={`object-cover ${className}`} draggable={false} />;
  }
  if (item.type === "text") {
    return (
      <div className={`flex items-center justify-center overflow-hidden p-1.5 text-center text-white font-semibold leading-tight break-words ${className}`} style={{ backgroundColor: item.backgroundColor || "#00A884", fontSize: 10 }}>
        <span className="line-clamp-4">{item.content}</span>
      </div>
    );
  }
  const Icon = item.type === "video" ? Play : item.type === "audio" ? Headphones : FileText;
  return (
    <div className={`bg-[#1f2c34] flex items-center justify-center text-white ${className}`}>
      <Icon size={22} />
    </div>
  );
};

const coverItem = (h) => (h.cover && h.items.find((it) => it.content === h.cover)) || h.items.find((it) => it.type === "image") || h.items[0];

// The row of round highlight covers. For the owner it starts with a "New" circle and long-press / right-click edits one.
const HighlightsRow = ({ highlights, isOwn, onOpen, onNew, onEdit, showOwner = false }) => {
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  const startPress = (h) => {
    if (!isOwn || !onEdit) return;
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onEdit(h);
    }, 550);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  return (
    <div className="flex gap-5 overflow-x-auto px-4 py-2 no-scrollbar">
      {isOwn && (
        <button onClick={onNew} className="shrink-0 w-[76px] flex flex-col items-center gap-2 active:scale-95 transition-transform" aria-label="New highlight">
          <span className="size-[76px] rounded-full flex items-center justify-center" style={{ border: `2px dashed ${HL_ACCENT}`, background: HL_ACCENT_SOFT, color: HL_ACCENT }}>
            <Plus size={30} strokeWidth={2.2} />
          </span>
          <span className="text-[12.5px] font-medium text-wa-text truncate w-full text-center">New</span>
        </button>
      )}
      {highlights.map((h) => (
        <button
          key={h._id}
          onClick={() => {
            if (longPressed.current) return; // the long-press already opened the editor
            onOpen(h);
          }}
          onPointerDown={() => startPress(h)}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => {
            if (isOwn && onEdit) {
              e.preventDefault();
              onEdit(h);
            }
          }}
          className="shrink-0 w-[76px] flex flex-col items-center gap-2 active:scale-95 transition-transform select-none"
        >
          <span className="size-[76px] rounded-full p-[3px]" style={{ background: HL_GRADIENT }}>
            <span className="block size-full rounded-full overflow-hidden border-[3px] border-wa-bg">
              <UpdateThumb item={coverItem(h)} size={200} className="size-full" />
            </span>
          </span>
          <span className="text-[12.5px] font-medium text-wa-text truncate w-full text-center leading-tight">{h.title}</span>
          {showOwner && h.user?.fullName && <span className="-mt-1.5 text-[10.5px] text-wa-muted truncate w-full text-center">{h.user.fullName.split(" ")[0]}</span>}
        </button>
      ))}
    </div>
  );
};

export default HighlightsRow;
