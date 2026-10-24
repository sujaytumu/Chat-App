import mongoose from "mongoose";

// A Reel: a short vertical video (max 60 s) shown in the Reels feed to everyone who may see the poster
// (same "who can see whom" rule as chats). Comments live in StatusComment (targetId = reel id).
const reelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // none for an imported Discover clip
    videoUrl: { type: String, required: true },
    poster: { type: String, default: "" },
    caption: { type: String, default: "", maxlength: 300 },
    duration: { type: Number, default: 0 },
    filter: { type: String, default: "none" },
    trim: { start: { type: Number, default: 0 }, end: { type: Number, default: 0 } }, // end 0 = whole video
    song: { url: String, name: String, start: { type: Number, default: 0 } },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    views: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reposts: { type: Number, default: 0 },
    externalId: { type: String, index: { unique: true, sparse: true } }, // a Discover clip made real on first like / comment / save / send
    externalAuthor: { type: String, default: "" },
    fromStatus: { type: mongoose.Schema.Types.ObjectId, index: { unique: true, sparse: true } }, // a public video status shared as a reel
  },
  { timestamps: true }
);
reelSchema.index({ createdAt: -1 });

const Reel = mongoose.model("Reel", reelSchema);
export default Reel;
