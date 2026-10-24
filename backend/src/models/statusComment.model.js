import mongoose from "mongoose";

// A comment under a status update or a highlight item (Instagram-style: one level of replies, hearts on each).
// `targetId` is the status id, or the highlight item id; both are unique ObjectIds so they never collide.
const statusCommentSchema = new mongoose.Schema(
  {
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // owner of the status / highlight
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }, // set on replies
    text: { type: String, required: true, trim: true, maxlength: 500 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

statusCommentSchema.index({ targetId: 1, createdAt: 1 });

const StatusComment = mongoose.model("StatusComment", statusCommentSchema);
export default StatusComment;
