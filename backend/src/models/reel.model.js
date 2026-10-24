import mongoose from "mongoose";

// A Reel: a short vertical video (max 60 s) shown in the Reels feed to everyone who may see the poster
// (same "who can see whom" rule as chats). Comments live in StatusComment (targetId = reel id).
const reelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoUrl: { type: String, required: true },
    poster: { type: String, default: "" },
    caption: { type: String, default: "", maxlength: 300 },
    duration: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);
reelSchema.index({ createdAt: -1 });

const Reel = mongoose.model("Reel", reelSchema);
export default Reel;
