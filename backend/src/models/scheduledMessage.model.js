import mongoose from "mongoose";

// A text message waiting to be sent at `sendAt` (picked with a long-press on Send).
const schema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
    text: { type: String, required: true, maxlength: 2000 },
    sendAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("ScheduledMessage", schema);
