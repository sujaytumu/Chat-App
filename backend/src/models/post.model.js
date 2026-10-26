import mongoose from "mongoose";

// A photo post for the Feed (separate from reels and statuses)
const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    image: { type: String, required: true },
    caption: { type: String, default: "", maxlength: 500 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);
postSchema.index({ createdAt: -1 });

export default mongoose.model("Post", postSchema);
