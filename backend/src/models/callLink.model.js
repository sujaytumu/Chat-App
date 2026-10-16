import mongoose from "mongoose";

// A call anyone with the link can join ("Call link"), optionally for a set time ("Schedule call").
const callLinkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    callType: { type: String, enum: ["audio", "video"], default: "audio" },
    title: { type: String, default: "", maxlength: 60 },
    scheduledFor: { type: Date, default: null },
    invitees: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    remindedSoon: { type: Boolean, default: false },
    remindedStart: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
callLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
callLinkSchema.index({ creatorId: 1, scheduledFor: 1 });

export default mongoose.model("CallLink", callLinkSchema);
