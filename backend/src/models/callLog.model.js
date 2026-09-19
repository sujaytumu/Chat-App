import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    calleeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    callType: { type: String, enum: ["audio", "video"], required: true },
    status: {
      type: String,
      enum: ["ringing", "answered", "missed", "declined", "failed"],
      default: "ringing",
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callLogSchema.index({ callerId: 1, createdAt: -1 });
callLogSchema.index({ calleeId: 1, createdAt: -1 });

const CallLog = mongoose.model("CallLog", callLogSchema);
export default CallLog;
