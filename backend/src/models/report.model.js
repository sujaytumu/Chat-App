import mongoose from "mongoose";

// A member's report about a group, kept for the app owner to review.
const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    reason: { type: String, enum: ["spam", "abuse", "inappropriate", "scam", "other"], default: "other" },
    details: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

// One report per person per group (re-reporting just updates it).
reportSchema.index({ reporterId: 1, groupId: 1 }, { unique: true });

export default mongoose.model("Report", reportSchema);
