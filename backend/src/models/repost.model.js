import mongoose from "mongoose";

// "Repost": someone shares a reel with the people who can see them (it appears in their feeds as "X reposted").
const repostSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reelId: { type: mongoose.Schema.Types.ObjectId, ref: "Reel", required: true, index: true },
  },
  { timestamps: true }
);
repostSchema.index({ userId: 1, reelId: 1 }, { unique: true });

export default mongoose.model("Repost", repostSchema);
