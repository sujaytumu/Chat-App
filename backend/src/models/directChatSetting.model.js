import mongoose from "mongoose";

// Per-conversation settings shared by both people in a 1:1 chat (key = the two user ids, sorted).
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    disappearAfter: { type: Number, default: 0 },
    vanish: { type: Boolean, default: false }, // Vanish mode: seen messages disappear once the reader leaves the chat
  },
  { timestamps: true }
);

export const pairKey = (a, b) => [String(a), String(b)].sort().join("_");

export default mongoose.model("DirectChatSetting", schema);
