import { useState } from "react";
import { Download } from "lucide-react";
import { getPhotoDownload, onUnmeteredConnection } from "../lib/uiSettings";
import { optimizeImage } from "../lib/cdn";

// Photos downloaded or opened this session stay open (also when the list scrolls them off screen and back).
const opened = new Set();

// A photo inside a chat. Photos you sent always show; photos you received follow "Auto-download photos"
// (Storage and data): shown at once, only on Wi-Fi, or behind a tap-to-download placeholder.
const ChatPhoto = ({ src, mine, onLoad, onOpen }) => {
  const [shown, setShown] = useState(() => {
    if (mine || opened.has(src)) return true;
    const mode = getPhotoDownload();
    return mode === "always" || (mode === "wifi" && onUnmeteredConnection());
  });

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => {
          opened.add(src);
          setShown(true);
        }}
        className="mb-1 w-[260px] max-w-full h-[160px] rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-wa-text active:bg-white/10"
        aria-label="Download photo"
      >
        <span className="size-12 rounded-full bg-black/40 flex items-center justify-center">
          <Download size={22} />
        </span>
        <span className="text-[12.5px] text-wa-muted">Photo · tap to download</span>
      </button>
    );
  }
  return (
    <img
      src={optimizeImage(src, 260)}
      alt="Attachment"
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
      onClick={onOpen}
      className="max-w-full w-[260px] max-h-[320px] h-auto object-cover rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
    />
  );
};

export default ChatPhoto;
