import mongoose from "mongoose";

const statusSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "image"], required: true },
    content: { type: String, required: true }, // text content, or image URL
    backgroundColor: { type: String, default: "#00A884" }, // for text statuses
    viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Who viewed it and when (shown to the owner only)
    views: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

statusSchema.index({ userId: 1, createdAt: -1 });
// TTL index — MongoDB automatically deletes the document once expiresAt passes,
// no cron job needed to clean up expired (24h) statuses.
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Status = mongoose.model("Status", statusSchema);
export default Status;
