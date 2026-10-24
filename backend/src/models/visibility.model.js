import mongoose from "mongoose";

// The owner decides who may see whom. One row = two people who can see each other (key = their ids, sorted).
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    a: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    b: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Visibility", schema);
