import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    text: { type: String, default: "", maxlength: 2000 },
    image: { type: String, default: "" },
    reactions: { type: [{ _id: false, userId: mongoose.Schema.Types.ObjectId, emoji: String }], default: [] },
  },
  { timestamps: true }
);
postSchema.index({ channelId: 1, createdAt: -1 });

export default mongoose.model("ChannelPost", postSchema);
