// A message counts as a "sticker" (rendered big, no bubble background) when
// it's short and made up entirely of emoji — matching WhatsApp's behavior
// for emoji-only messages and one-tap sticker sends.
const EMOJI_REGEX =
  /^(?:\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})?(?:\uFE0F)?)+$/u;

export function isStickerMessage(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 16) return false;
  return EMOJI_REGEX.test(trimmed);
}

// How many emoji an emoji-only message holds (0 if it has any other text).
export function emojiOnlyCount(text) {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40 || !EMOJI_REGEX.test(trimmed)) return 0;
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  return seg ? [...seg.segment(trimmed)].length : [...trimmed].length;
}

// WhatsApp keeps emoji-only messages inside the normal bubble and only nudges the
// size up a little (fewer emoji -> a bit bigger). Returns the font size in px.
export function emojiFontSize(count) {
  if (count <= 0) return null;
  if (count === 1) return 36;
  if (count <= 3) return 32;
  if (count <= 8) return 28;
  return 22;
}

// "📍 Current location" or "📍 <place name>", then the maps link on the next line.
const LOCATION_REGEX = /^📍 ([^\n]{1,120})\nhttps:\/\/www\.google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)$/;

export function parseLocationMessage(text) {
  if (!text) return null;
  const match = text.match(LOCATION_REGEX);
  if (!match) return null;
  return { title: match[1], lat: match[2], lng: match[3], url: `https://www.google.com/maps?q=${match[2]},${match[3]}` };
}

// A reel sent into a chat: "🎬 Reel by <name>" then its link on the next line.
const REEL_REGEX = /^🎬 Reel by ([^\n]{1,80})\n\S*\/reels\?r=([a-f0-9]{24})$/;

export function parseReelMessage(text) {
  if (!text) return null;
  const m = text.match(REEL_REGEX);
  return m ? { by: m[1], id: m[2] } : null;
}

export const reelMessageText = (reel) => `🎬 Reel by ${(reel.user?.fullName || "Talkies").replace(/\n/g, " ").slice(0, 80)}\n${window.location.origin}/reels?r=${reel._id}`;
