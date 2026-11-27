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
    // Repeating call (same link every day / week / month / year at the same time), for at most one year
    repeat: { type: String, enum: ["none", "daily", "weekly", "monthly", "yearly"], default: "none" },
    repeatUntil: { type: Date, default: null },
    tz: { type: String, default: "UTC" },
    firstAt: { type: Date, default: null },
    occurrence: { type: Number, default: 0 },
    remindedSoon: { type: Boolean, default: false },
    remindedStart: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
callLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
callLinkSchema.index({ creatorId: 1, scheduledFor: 1 });

export default mongoose.model("CallLink", callLinkSchema);
