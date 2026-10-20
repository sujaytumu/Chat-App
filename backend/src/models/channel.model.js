import mongoose from "mongoose";

// A Channel: one-way feed. The owner posts; anyone can follow and react.
const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
    description: { type: String, default: "", maxlength: 300 },
    icon: { type: String, default: "" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    followers: { type: [mongoose.Schema.Types.ObjectId], default: [], index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Channel", channelSchema);
