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
    // Video only: the part of the clip to play (seconds). Set when the video is longer than 90s.
    trim: {
      start: { type: Number },
      end: { type: Number },
    },
    // A song picked from the person's device, played while the status is open
    song: {
      url: { type: String },
      name: { type: String },
      start: { type: Number, default: 0 }, // where in the song to begin (seconds)
      length: { type: Number, default: 0 }, // how long it plays = how long a picture / text status stays (15 – 30 s)
    },
    // A place tag (e.g. "Chennai, Tamil Nadu")
    location: {
      name: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
    closeFriends: { type: Boolean, default: false }, // shared with the owner's Close friends list (green star)
    // Who may see it: everyone (my contacts), everyone except some people, or only some people
    audience: {
      mode: { type: String, enum: ["all", "except", "only"], default: "all" },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    backgroundColor: { type: String, default: "#00A884" }, // for text statuses
    font: { type: Number, default: 0, min: 0, max: 4 }, // text-status font style
    viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Who viewed it and when (shown to the owner only)
    views: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
    // Hearts (WhatsApp-style "like" on a status); the owner sees who liked it
    likes: [
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
// Statuses used to be deleted by a TTL index when they expired. They are now KEPT (so the owner can browse their
// whole history and save any of it to a highlight); expiresAt only decides what other people can still see.
// Every read of "live" statuses filters on expiresAt > now. (db.js drops the old TTL index on startup.)
statusSchema.index({ expiresAt: 1 });

const Status = mongoose.model("Status", statusSchema);
export default Status;
