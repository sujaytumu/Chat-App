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
    // Chat lock: chats hidden behind the person's PIN ("d:<id>" / "g:<id>").
    // The PIN is stored only as a bcrypt hash and never returned by queries.
    lockedChats: { type: [String], default: [] },
    chatLockPin: { type: String, select: false },
    // Chats the person flagged "Mark as unread" (shows a green dot until opened).
    markedUnread: { type: [String], default: [] },
    // Two-step verification (authenticator app). Secrets are never returned by
    // default queries (select:false) — only the 2FA endpoints ask for them.
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
      backupCodes: { type: [String], select: false, default: undefined }, // sha256 hashes
      lastStep: { type: Number, select: false, default: 0 },
    },
    // When this person was last connected (shown as "last seen" unless they hide it).
    lastSeen: { type: Date, default: null },
    // Privacy: what other people can see about me. Defaults are all on.
    privacy: {
      readReceipts: { type: Boolean, default: true },
      typing: { type: Boolean, default: true },
      online: { type: Boolean, default: true },
    },
    // People I have blocked (they can't message or call me; I can't message them).
    blockedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Chat lists shown as filter chips: the built-in "favourites" list plus the
    // user's own lists. Each holds chat keys ("d:<id>" / "g:<id>").
    chatLists: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          name: { type: String, required: true, maxlength: 30 },
          chats: { type: [String], default: [] },
        },
      ],
      default: [],
    },
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
