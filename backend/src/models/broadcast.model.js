import mongoose from "mongoose";

// A broadcast list: a saved set of contacts you can send one message to.
// Each recipient gets it as a normal one-to-one chat message (they can't see the others).
const broadcastSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model("Broadcast", broadcastSchema);
