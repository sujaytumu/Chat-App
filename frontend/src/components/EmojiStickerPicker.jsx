import { useState, useEffect } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Smile, Sticker, Search, Delete } from "lucide-react";

// A curated set of large single-emoji "stickers" — tapping one sends it
// immediately as an oversized sticker-style message (see ChatContainer's
// sticker-detection rendering), the same one-tap send pattern WhatsApp uses.
const STICKER_CATEGORIES = [
  {
    label: "Reactions",
    stickers: ["😂", "🤣", "❤️", "🔥", "👍", "👎", "😍", "🥰", "😊", "😢", "😭", "😮", "🤔", "😴", "😎", "🥳"],
  },
  {
    label: "Gestures",
    stickers: ["👏", "🙌", "🙏", "🤝", "💯", "👌", "✌️", "🤞", "👊", "✋", "🤙", "💪"],
  },
  {
    label: "Animals",
    stickers: ["🐶", "🐱", "🐼", "🦁", "🐸", "🐧", "🦋", "🐝"],
  },
  {
    label: "Food",
    stickers: ["🍕", "🍔", "🍟", "🍩", "🍦", "☕", "🍺", "🎂"],
  },
  {
    label: "Fun & Nature",
    stickers: ["🎉", "🎈", "⚽", "🎵", "☀️", "🌧️", "🌈", "⭐"],
  },
];

const PANEL_CSS = `
.wa-emoji .EmojiPickerReact{--epr-bg-color:transparent;--epr-category-label-bg-color:transparent;--epr-picker-border-color:transparent;--epr-search-border-color:transparent;--epr-hover-bg-color:rgba(255,255,255,.08);border:0;border-radius:0;height:100%!important;width:100%!important}
.wa-emoji .EmojiPickerReact .epr-header{display:contents}
.wa-emoji .EmojiPickerReact .epr-search-container{order:0;padding:4px 12px 6px}
.wa-emoji .EmojiPickerReact .epr-body{order:1}
.wa-emoji .EmojiPickerReact .epr-category-nav{order:2;padding:6px 10px;border-top:1px solid rgba(255,255,255,.08)}
.wa-emoji .EmojiPickerReact .epr-emoji-category-label{font-size:14px;font-weight:500;color:var(--wa-muted,#8696a0);text-transform:none;position:static}
`;

const EmojiStickerPicker = ({ onEmojiSelect, onStickerSelect, onBackspace, onClose }) => {
  const [tab, setTab] = useState("emoji");

  // Like WhatsApp: tapping the text box brings the keyboard back and hides the panel.
  useEffect(() => {
    const ta = document.querySelector("[data-chat-composer] textarea");
    if (!ta) return;
    const close = () => onClose();
    ta.addEventListener("pointerdown", close);
    return () => ta.removeEventListener("pointerdown", close);
  }, [onClose]);

  const focusSearch = () => {
    setTab("emoji");
    setTimeout(() => document.querySelector(".wa-emoji .epr-search")?.focus(), 30);
  };

  const seg = (id, Icon, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-label={label}
      className={`h-8 w-14 rounded-full flex items-center justify-center transition-colors ${
        tab === id ? "bg-white/15 text-wa-text" : "text-wa-muted"
      }`}
    >
      <Icon size={20} />
    </button>
  );

  return (
    <div className="wa-emoji w-full bg-wa-pop rounded-t-2xl overflow-hidden flex flex-col h-[300px] sm:h-[320px]" style={{ animation: "m-fade .15s ease-out" }}>
      <style>{PANEL_CSS}</style>
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/25 shrink-0" />
      <div className="flex items-center justify-between px-3 pt-1.5 pb-1 shrink-0">
        <button type="button" onClick={focusSearch} aria-label="Search emoji" className="size-9 rounded-full flex items-center justify-center text-wa-muted active:bg-white/10">
          <Search size={20} />
        </button>
        <div className="flex items-center rounded-full bg-black/20 p-0.5">
          {seg("emoji", Smile, "Emoji")}
          {seg("stickers", Sticker, "Stickers")}
        </div>
        {tab === "emoji" ? (
          <button type="button" onClick={onBackspace} aria-label="Delete" className="size-9 rounded-full flex items-center justify-center text-wa-muted active:bg-white/10">
            <Delete size={21} />
          </button>
        ) : (
          <span className="size-9" />
        )}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "emoji" ? (
          <EmojiPicker
            onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
            theme={Theme.DARK}
            width="100%"
            height="100%"
            perRow={8}
            emojiSize={30}
            skinTonesDisabled
            searchPlaceHolder="Search emoji"
            previewConfig={{ showPreview: false }}
          />
        ) : (
          <div className="p-3 h-full overflow-y-auto">
            {STICKER_CATEGORIES.map((category) => (
              <div key={category.label} className="mb-3">
                <p className="text-sm font-medium text-wa-muted mb-1.5 px-1">{category.label}</p>
                <div className="grid grid-cols-6 gap-1">
                  {category.stickers.map((sticker) => (
                    <button key={sticker} type="button" onClick={() => onStickerSelect(sticker)} className="text-4xl p-1.5 rounded-lg active:bg-white/10 transition-colors">
                      {sticker}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmojiStickerPicker;
