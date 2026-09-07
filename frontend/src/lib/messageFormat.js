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

const LOCATION_REGEX = /^📍 Current location\nhttps:\/\/www\.google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)$/;

export function parseLocationMessage(text) {
  if (!text) return null;
  const match = text.match(LOCATION_REGEX);
  if (!match) return null;
  return { lat: match[1], lng: match[2], url: `https://www.google.com/maps?q=${match[1]},${match[2]}` };
}
