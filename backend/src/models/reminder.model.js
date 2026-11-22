import mongoose from "mongoose";

// "Remind me about this message": fires once at `remindAt` (push + in-app), then is deleted.
// With `ifNoReply` it is a follow-up nudge on a message I sent: if the other person (or anyone, in a group)
// has answered by then it is dropped silently, otherwise "No reply yet" is shown.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    chatType: { type: String, enum: ["direct", "group"], required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, required: true }, // the other person's id, or the group id
    preview: { type: String, default: "", maxlength: 140 },
    remindAt: { type: Date, required: true, index: true },
    ifNoReply: { type: Boolean, default: false },
    msgAt: { type: Date }, // when the message was sent (replies are looked for after this)
  },
  { timestamps: true }
);

export default mongoose.model("Reminder", schema);
