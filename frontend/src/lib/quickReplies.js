// Quick replies: tap-to-send suggestions under an incoming message.
// Built from simple patterns on the device itself — the message never leaves the phone.
const KEY = "talkies.quickReplies";
export const getQuickReplies = () => {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
};
export const setQuickReplies = (on) => {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
};

const RULES = [
  [/\b(good\s*night|gn|night night|shubh ratri)\b/i, ["Good night! 🌙", "Sleep well", "Sweet dreams"]],
  [/\b(good\s*morning|gm|subah)\b/i, ["Good morning! ☀️", "Morning! How are you?", "Hey, morning 👋"]],
  [/\b(how are you|how r u|how are u|kaise ho|kaisi ho|kya haal|ela unnav|ela unnaru)\b/i, ["I'm good, you?", "Doing great! You?", "All good 😊"]],
  [/\b(thanks|thank you|thx|ty|dhanyavad|thanks a lot)\b/i, ["You're welcome!", "Anytime 🙂", "No problem!"]],
  [/\b(congrats|congratulations|happy birthday|hbd|best wishes)\b/i, ["Thank you! 🙏", "Thanks a lot!", "Means a lot 😊"]],
  [/\b(bye|see you|see ya|ttyl|take care|talk later)\b/i, ["Bye! 👋", "Talk soon", "Take care!"]],
  [/\b(call me|can you call|can u call|give me a call|call now)\b/i, ["Calling now", "Can't talk right now", "I'll call you later"]],
  [/\b(where are you|where r u|where are u|location|kahan ho|ekkada)\b/i, ["On my way", "I'll share my location", "Not sure yet"]],
  [/\b(what time|when|which day|at what time)\b.*\?/i, ["In a few minutes", "Tonight", "Tomorrow"]],
  [/\b(are you free|u free|you free|free now|busy)\b/i, ["Yes, I'm free", "Give me 10 minutes", "I'm busy right now"]],
  [/^(hi+|hello+|hey+|hii+|hlo|yo|namaste|hola)\b[\s!.,]*(there|bro|buddy)?[\s!.]*$/i, ["Hey! 👋", "Hi, how are you?", "Hello!"]],
  [/^(ok|okay|k|kk|cool|fine|alright|sure|done|noted)[\s!.]*$/i, ["👍", "Okay", "Sounds good"]],
  [/\b(sorry|my bad|apologies)\b/i, ["No worries", "It's okay 🙂", "All good"]],
  [/\b(love you|miss you|miss u)\b/i, ["Love you too ❤️", "Miss you too", "Aww 🥰"]],
];
const YES_NO = /^(are|is|do|did|does|can|could|will|would|have|has|should|shall|was|were|am|wanna|want to|u |you )/i;

export function suggestReplies(text) {
  const t = (text || "").trim().slice(0, 300);
  if (!t) return [];
  for (const [re, out] of RULES) if (re.test(t)) return out;
  if (t.endsWith("?")) return YES_NO.test(t) ? ["Yes", "No", "Maybe later"] : ["Let me check", "Not sure yet", "I'll tell you later"];
  return [];
}
