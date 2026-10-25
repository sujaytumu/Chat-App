import mongoose from "mongoose";

// "Not interested" / "Report" on a reel: it never shows up in that person's feed again. A report is
// also kept (reason) so the app owner can review it.
const reelHideSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reelId: { type: mongoose.Schema.Types.ObjectId, ref: "Reel", required: true },
    reason: { type: String, enum: ["", "spam", "abuse", "inappropriate", "scam", "other"], default: "" },
  },
  { timestamps: true }
);
reelHideSchema.index({ userId: 1, reelId: 1 }, { unique: true });

export default mongoose.model("ReelHide", reelHideSchema);
