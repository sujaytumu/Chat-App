import mongoose from "mongoose";

// A highlight is a saved collection of status updates that stays on the owner's Updates page after the
// 24-hour status expires (like Instagram story highlights). Each item is a COPY of the status as it was
// (the media itself lives on the CDN), because the original status document is deleted by the TTL index.
const itemSchema = new mongoose.Schema({
  sourceId: { type: mongoose.Schema.Types.ObjectId }, // the status it was saved from (stops saving it twice)
  type: { type: String, enum: ["text", "image", "video", "audio", "file"], required: true },
  content: { type: String, required: true },
  caption: { type: String, default: "", maxlength: 700 },
  file: { name: String, size: Number, mime: String },
  trim: { start: Number, end: Number },
  song: { url: String, name: String },
  location: { name: String, lat: Number, lng: Number },
  backgroundColor: { type: String, default: "#00A884" },
  font: { type: Number, default: 0, min: 0, max: 4 },
  // Whoever could not see the status can't see it in the highlight either
  audience: {
    mode: { type: String, enum: ["all", "except", "only"], default: "all" },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  postedAt: { type: Date, required: true }, // when the status was originally posted
  // Views and hearts on the highlight itself (the original status' ones are gone with it)
  viewedBy: [{ type: mongoose.Schema.Types.ObjectId }],
  views: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: Date, _id: false }],
  likes: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: Date, _id: false }],
});

const highlightSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 20 },
    // Optional chosen cover picture (URL). Without it the app uses the first picture / colour.
    cover: { type: String, default: "" },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true }
);

highlightSchema.index({ updatedAt: -1 });

const Highlight = mongoose.model("Highlight", highlightSchema);
export default Highlight;
