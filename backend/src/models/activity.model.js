import mongoose from "mongoose";

// "Activity": who liked or commented on your reels and posts (the in-app list behind the heart button).
const activitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who gets the notification
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who did it
    type: { type: String, enum: ["like", "comment", "reply"], required: true },
    kind: { type: String, enum: ["reel", "post"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    thumb: { type: String, default: "" },
    text: { type: String, default: "", maxlength: 200 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 }); // keep 30 days

export default mongoose.model("Activity", activitySchema);
