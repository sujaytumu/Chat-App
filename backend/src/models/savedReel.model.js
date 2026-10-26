import mongoose from "mongoose";

// A reel the person bookmarked (kept as a small snapshot so it opens even from the Saved list).
const savedReelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true }, // "reel:<id>" | "px:<id>"
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);
savedReelSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model("SavedReel", savedReelSchema);
