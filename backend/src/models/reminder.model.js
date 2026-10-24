import mongoose from "mongoose";

// "Remind me about this message": fires once at `remindAt` (push + in-app), then is deleted.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    chatType: { type: String, enum: ["direct", "group"], required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, required: true }, // the other person's id, or the group id
    preview: { type: String, default: "", maxlength: 140 },
    remindAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Reminder", schema);
