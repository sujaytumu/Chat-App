import mongoose from "mongoose";

// "Can I see more people?" — a person asks the owner; the owner approves (and picks who) or declines.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: { type: String, enum: ["pending", "approved", "declined"], default: "pending" },
    declines: { type: Number, default: 0 }, // how many times the owner said no in a row
    declinedAt: { type: Date, default: null },
    note: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true }
);

export default mongoose.model("AccessRequest", schema);
