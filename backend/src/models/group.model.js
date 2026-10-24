import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    groupPic: {
      type: String,
      default: "",
    },
    // Shown under the group name on the group info screen
    description: { type: String, default: "", maxlength: 512 },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    // Anyone signed in with this code can join (admins can reset it).
    inviteCode: { type: String, index: true, sparse: true, select: false },
    // Disappearing messages: new messages vanish this many seconds after being sent (0 = off).
    disappearAfter: { type: Number, default: 0 },
    // Who may do what. Defaults keep the original behaviour.
    permissions: {
      editInfo: { type: String, enum: ["admins", "all"], default: "admins" },
      addMembers: { type: String, enum: ["admins", "all"], default: "admins" },
      sendMessages: { type: String, enum: ["admins", "all"], default: "all" },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Group = mongoose.model("Group", groupSchema);

export default Group;
