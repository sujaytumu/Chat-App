import mongoose from "mongoose";

// A reel the person pinned: it shows first when they open Reels, in the order they pinned them (oldest pin first).
// Pins are personal - each person has their own.
const reelPinSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reelId: { type: mongoose.Schema.Types.ObjectId, ref: "Reel", required: true },
  },
  { timestamps: true }
);
reelPinSchema.index({ userId: 1, reelId: 1 }, { unique: true });
reelPinSchema.index({ reelId: 1 });

export default mongoose.model("ReelPin", reelPinSchema);
