import mongoose from "mongoose";

// A photo post for the Feed (separate from reels and statuses)
const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    image: { type: String, required: true }, // first photo (older posts have only this)
    images: [{ type: String }], // all photos, up to 10
    caption: { type: String, default: "", maxlength: 500 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Post", postSchema);
