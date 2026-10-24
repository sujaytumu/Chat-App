import mongoose from "mongoose";

// A playlist two people (or a whole group) build together: key = "d:<pairKey>" or "g:<groupId>".
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    songs: [
      {
        id: String,
        title: String,
        artist: String,
        art: String,
        preview: String,
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedByName: String,
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Playlist", schema);
