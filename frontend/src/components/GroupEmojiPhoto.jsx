import { useState } from "react";
import { X, Check } from "lucide-react";
import EmojiPicker, { Theme, EmojiStyle } from "emoji-picker-react";
import { useBackToClose } from "../lib/useBackToClose";

// "Emoji & sticker" group photo: pick an emoji and a background colour, and it
// is drawn onto a square picture that becomes the group photo.
const COLORS = ["#00A884", "#128C7E", "#1E88E5", "#8E24AA", "#E91E63", "#F4511E", "#F9A825", "#546E7A", "#2A3942", "#FFFFFF"];

function renderEmojiPhoto(emoji, bg) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size * 0.56}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL("image/jpeg", 0.9);
}

const GroupEmojiPhoto = ({ onClose, onSave }) => {
  const [emoji, setEmoji] = useState("😀");
  const [bg, setBg] = useState(COLORS[0]);
  useBackToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 flex items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm h-full sm:h-auto sm:max-h-[92vh] bg-wa-panel text-wa-text sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-5 px-4 h-14 shrink-0">
          <button onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
          <h3 className="text-[19px] flex-1">Emoji & sticker</h3>
          <button
            onClick={() => onSave(renderEmojiPhoto(emoji, bg))}
            className="size-10 rounded-full bg-[#00A884] flex items-center justify-center"
            aria-label="Use as group photo"
          >
            <Check size={22} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-3">
          <div
            className="size-32 rounded-full flex items-center justify-center text-[64px] leading-none"
            style={{ background: bg }}
          >
            {emoji}
          </div>
          <div className="flex gap-2 flex-wrap justify-center px-4">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBg(c)}
                className={`size-8 rounded-full border-2 ${bg === c ? "border-white" : "border-white/20"}`}
                style={{ background: c }}
                aria-label={`Background ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex justify-center">
          <EmojiPicker
            theme={Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            width="100%"
            height={340}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            onEmojiClick={(e) => setEmoji(e.emoji)}
          />
        </div>
      </div>
    </div>
  );
};

export default GroupEmojiPhoto;
