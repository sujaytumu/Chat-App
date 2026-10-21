import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Present for 1:1 direct messages
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Present for group messages
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    text: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    vanish: { type: Boolean, default: false }, // sent in Vanish mode
    // Direct messages: has this been seen / delivered to the receiver?
    seen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
      default: null,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    // Group messages: which members have seen this message
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // One emoji reaction per person per message (WhatsApp-style)
    reactions: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String, maxlength: 16 },
      },
    ],
    // Group messages: per-member delivery / read receipts with times, for the
    // WhatsApp-style "Message info" (seenBy above stays the fast unread filter).
    deliveredTo: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
    seenLog: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
    // Non-image attachment: video, audio, or generic document
    file: {
      url: { type: String },
      name: { type: String },
      size: { type: Number },
      type: { type: String, enum: ["video", "audio", "document"] },
      // Voice notes
      duration: { type: Number },
      waveform: { type: [Number], default: undefined },
      // Video message: a short round clip recorded inside the chat
      videoNote: { type: Boolean, default: undefined },
    },
    // Voice notes: the written-out words, made on request (shown under the voice note)
    transcript: { type: { text: String, at: Date }, default: undefined, _id: false },
    editedAt: { type: Date, default: null },
    // Reply to someone's status: a small quote of it above the message.
    statusReply: {
      type: { kind: String, preview: String, color: String },
      default: undefined,
    },
    // Shown as "Forwarded" above the message.
    forwarded: { type: Boolean, default: false },
    // Shared contact card (another Talkies user).
    contact: {
      type: { userId: mongoose.Schema.Types.ObjectId, fullName: String, profilePic: String },
      default: undefined,
    },
    // Poll: question + options; each option keeps the ids of the people who chose it.
    poll: {
      type: {
        question: String,
        multiple: { type: Boolean, default: false },
        options: [{ text: String, votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] }],
      },
      default: undefined,
    },
    // Event: title, time, place and the RSVP lists (ids of who is going / maybe / can't make it).
    event: {
      type: {
        title: String,
        description: String,
        location: String,
        startsAt: Date,
        going: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        maybe: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        declined: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      },
      default: undefined,
    },
    // Live location: a moving position that the sender updates until it expires or is stopped.
    liveLocation: {
      type: {
        lat: Number,
        lng: Number,
        accuracy: Number,
        startedAt: Date,
        updatedAt: Date,
        expiresAt: Date,
        active: { type: Boolean, default: true },
      },
      default: undefined,
    },
    // View-once photo: the picture lives in viewOnceUrl (never sent in lists) until the receiver opens it once.
    viewOnce: { type: Boolean, default: false },
    viewOnceOpened: { type: Boolean, default: false },
    viewOnceUrl: { type: String, select: false },
    // Group @mentions: the members tagged in this message.
    mentions: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
    pinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    clientId: { type: String, default: undefined }, // the sender's own id for a just-typed message (lets the app match its clock copy)
    pinUntil: { type: Date, default: null }, // pins can expire (8 hours / 24 hours / 7 days)
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    starredBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Disappearing messages: when set, MongoDB removes the message at this time.
    expiresAt: { type: Date, default: null },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ groupId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, seen: 1 });
messageSchema.index({ receiverId: 1, delivered: 1 });
messageSchema.index({ image: 1 }, { partialFilterExpression: { image: { $type: "string", $gt: "" } } }); // who may open this file (/api/media)
messageSchema.index({ "file.url": 1 }, { partialFilterExpression: { "file.url": { $type: "string", $gt: "" } } });
messageSchema.index({ groupId: 1, seenBy: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
