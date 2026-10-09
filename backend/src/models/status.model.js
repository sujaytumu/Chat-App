import mongoose from "mongoose";

const statusSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "image", "video", "audio", "file"], required: true },
    content: { type: String, required: true }, // text content, or image URL
    // Optional text under a photo / video / audio / file
    caption: { type: String, default: "", maxlength: 700 },
    // For video / audio / file statuses
    file: {
      name: { type: String },
      size: { type: Number },
      mime: { type: String },
    },
    // A song picked from the person's device, played while the status is open
    song: {
      url: { type: String },
      name: { type: String },
    },
    // A place tag (e.g. "Chennai, Tamil Nadu")
    location: {
      name: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
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
