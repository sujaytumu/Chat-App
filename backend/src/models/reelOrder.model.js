import mongoose from "mongoose";

// The order the app owner arranged the reels in (drag and drop in the Explore grid). One row for the whole app.
// Reels not listed here (new ones) simply follow after, in posting order.
const reelOrderSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    ids: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { timestamps: true }
);

export default mongoose.model("ReelOrder", reelOrderSchema);
