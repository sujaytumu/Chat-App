import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    // Short "about" line shown on their profile (max 139 chars, like WhatsApp)
    about: { type: String, default: "", maxlength: 139 },
    // Chats this user has archived, as "d:<userId>" (direct) / "g:<groupId>"
    // (group) keys. Per-user, so it follows them across devices.
    archivedChats: {
      type: [String],
      default: [],
    },
    // Look & sound settings (theme, wallpapers, tones...) so every device —
    // browser, installed app, Android app — shows the same thing. Whitelisted
    // keys only; values are strings.
    preferences: { type: Object, default: {} },
    // Same key format: chats pinned to the top (max 3) and chats whose
    // notifications are muted.
    pinnedChats: { type: [String], default: [] },
    mutedChats: { type: [String], default: [] },
    // Web Push subscriptions (one per browser/device the user has granted
    // notification permission on)
    pushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
        },
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
