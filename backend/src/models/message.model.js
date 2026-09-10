import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Present for 1:1 direct messages
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Present for group messages
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    text: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    // Direct messages: has this been seen / delivered to the receiver?
    seen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
      default: null,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    // Group messages: which members have seen this message
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Non-image attachment: video, audio, or generic document
    file: {
      url: { type: String },
      name: { type: String },
      size: { type: Number },
      type: { type: String, enum: ["video", "audio", "document"] },
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ groupId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, seen: 1 });
messageSchema.index({ receiverId: 1, delivered: 1 });
messageSchema.index({ groupId: 1, seenBy: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
