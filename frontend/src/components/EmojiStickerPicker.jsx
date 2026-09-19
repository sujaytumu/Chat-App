import { useState, useRef, useEffect } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Smile, Sticker } from "lucide-react";

// A curated set of large single-emoji "stickers" — tapping one sends it
// immediately as an oversized sticker-style message (see ChatContainer's
// sticker-detection rendering), the same one-tap send pattern WhatsApp uses.
const STICKERS = [
  "😂", "❤️", "🔥", "👍", "🙏", "😍", "😊", "🎉",
  "😢", "😎", "🥳", "😴", "🤔", "😮", "👏", "💯",
  "🤝", "🙌", "😅", "🥰", "😭", "🤣", "😁", "👌",
];

const EmojiStickerPicker = ({ onEmojiSelect, onStickerSelect, onClose }) => {
  const [tab, setTab] = useState("emoji");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full right-0 mb-2 bg-[#233138] rounded-xl shadow-2xl z-20 overflow-hidden w-[320px]"
    >
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("emoji")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm ${
            tab === "emoji" ? "text-[#00A884] border-b-2 border-[#00A884]" : "text-[#8696A0]"
          }`}
        >
          <Smile size={16} /> Emoji
        </button>
        <button
          onClick={() => setTab("stickers")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm ${
            tab === "stickers" ? "text-[#00A884] border-b-2 border-[#00A884]" : "text-[#8696A0]"
          }`}
        >
          <Sticker size={16} /> Stickers
        </button>
      </div>

      {tab === "emoji" ? (
        <EmojiPicker
          onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
          theme={Theme.DARK}
          width="100%"
          height={360}
          searchDisabled={false}
          skinTonesDisabled
          previewConfig={{ showPreview: false }}
        />
      ) : (
        <div className="grid grid-cols-6 gap-1 p-3 h-[360px] overflow-y-auto content-start">
          {STICKERS.map((sticker) => (
            <button
              key={sticker}
              onClick={() => onStickerSelect(sticker)}
              className="text-4xl p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              {sticker}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmojiStickerPicker;
