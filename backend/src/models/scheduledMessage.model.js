import mongoose from "mongoose";

// A text message waiting to be sent at `sendAt` (picked with a long-press on Send).
const schema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
    text: { type: String, required: true, maxlength: 2000 },
    sendAt: { type: Date, required: true, index: true },
    // Repeating ("every day / week / month / year"): it stops by itself at repeatUntil (one year after it was set up).
    repeat: { type: String, enum: ["none", "daily", "weekly", "monthly", "yearly"], default: "none" },
    repeatUntil: { type: Date, default: null },
    tz: { type: String, default: "UTC" }, // the person's timezone, so 12:00 AM stays 12:00 AM
    firstAt: { type: Date, default: null }, // the first date; every repeat is counted from it
    occurrence: { type: Number, default: 0 }, // how many times it has been sent so far
  },
  { timestamps: true }
);

export default mongoose.model("ScheduledMessage", schema);
