import mongoose from "mongoose";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import DirectChatSetting, { pairKey } from "../models/directChatSetting.model.js";
import { buildStatusReply } from "../lib/statusReply.js";
import { getLinkPreview } from "../lib/linkPreview.js";
import { sanitizePoll } from "../lib/poll.js";
import { buildContact } from "../lib/contactCard.js";
import { markGroupDelivered } from "../lib/groupReceipts.js";
import { markDirectDeliveredFor } from "../lib/directReceipts.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io, setPrivacyCache, refreshOnline, onSocketConnection } from "../lib/socket.js";
import { uploadFileAttachment, MAX_BASE64_LENGTH } from "../lib/uploadFile.js";
import { sendPushToUser } from "../lib/webPush.js";
import { getUserLean, getUserDoc } from "../lib/authCache.js";
import { rememberMessage } from "../lib/recentMessages.js";
import { resolveMediaRef, deliveryUrl } from "../lib/privateMedia.js";
import { sanitizeEvent } from "../lib/event.js";
import { sanitizeLiveLocation, cleanPosition } from "../lib/liveLocation.js";

// Max base64 image payload accepted (~6.5MB decodes to ~5MB image)
const MAX_IMAGE_BASE64_LENGTH = 6.5 * 1024 * 1024;

// Delivery receipts are cumulative, like WhatsApp: once a device has received
// (or opened) anything from someone, every earlier message from them to this
// user has reached it too. Flips them all to "delivered" and tells the senders.
export async function markDirectDelivered(receiverId, extra = {}) {
  return markDirectDeliveredFor(
    (uid, ev, payload) => {
      const room = getReceiverSocketId(uid);
      if (room) io.to(room).emit(ev, payload);
    },
    receiverId,
    extra
  );
}

// A reply proves the other person got AND opened the chat: everything I sent them before it
// is delivered and read (blue ticks), exactly like WhatsApp. `replier` just sent something to `other`.
export async function markImpliedRead(replier, other, upTo = new Date()) {
  try {
    const result = await Message.updateMany(
      { senderId: other, receiverId: replier, groupId: null, createdAt: { $lte: upTo }, $or: [{ seen: false }, { delivered: false }] },
      { $set: { seen: true, seenAt: upTo, delivered: true, deliveredAt: upTo } }
    );
    if (!result.modifiedCount) return;
    const room = getReceiverSocketId(other);
    if (!room) return;
    io.to(room).emit("messagesDelivered", { by: String(replier) });
    const me = await User.findById(replier).select("privacy").lean();
    const them = await User.findById(other).select("privacy").lean();
    if (me?.privacy?.readReceipts !== false && them?.privacy?.readReceipts !== false) {
      io.to(room).emit("messagesSeen", { by: String(replier), count: result.modifiedCount });
    }
  } catch (e) {
    console.log("Error in markImpliedRead:", e.message);
  }
}

// Sidebar: direct-message contacts, each with last message + unread count.
// Uses two aggregations (not one query per contact) so this stays fast
// regardless of how many contacts/messages exist.
// Set (or clear, with empty text) my Note. It lasts 24 hours and is pushed live to everyone online.
export const setNote = async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 60) : "";
    const note = text ? { text, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } : { text: "", expiresAt: null };
    await User.findByIdAndUpdate(req.user._id, { $set: { note } });
    io.emit("userNote", { userId: String(req.user._id), note });
    res.status(200).json({ note });
  } catch (error) {
    console.log("Error in setNote controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    markDirectDelivered(loggedInUserId); // opening the app = all waiting messages have arrived
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId }, deleted: { $ne: true } })
      .select("-tokenVersion -deleted -password -pushSubscriptions -archivedChats -lockedChats -chatLockPin -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled")
      .lean();

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate([
        {
          $match: {
            groupId: null,
            deletedFor: { $ne: loggedInUserId },
            $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              $cond: [{ $eq: ["$senderId", loggedInUserId] }, "$receiverId", "$senderId"],
            },
            text: { $first: "$text" },
            image: { $first: "$image" },
            viewOnce: { $first: "$viewOnce" },
            file: { $first: "$file" },
            createdAt: { $first: "$createdAt" },
            senderId: { $first: "$senderId" },
            delivered: { $first: "$delivered" },
            seen: { $first: "$seen" },
          },
        },
      ]),
      Message.aggregate([
        { $match: { receiverId: loggedInUserId, groupId: null, seen: false, deletedFor: { $ne: loggedInUserId } } },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ]),
    ]);

    const lastMessageByUser = new Map(lastMessages.map((m) => [m._id.toString(), m]));
    const unreadByUser = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

    // People who haven't connected since "last seen" was introduced have no
    // saved time yet: fall back to their latest sent message, then account activity.
    const noSeen = filteredUsers.filter((u) => !u.lastSeen).map((u) => u._id);
    const lastSent = noSeen.length
      ? new Map(
          (
            await Message.aggregate([
              { $match: { senderId: { $in: noSeen } } },
              { $group: { _id: "$senderId", at: { $max: "$createdAt" } } },
            ])
          ).map((r) => [String(r._id), r.at])
        )
      : new Map();
    for (const u of filteredUsers) {
      if (!u.lastSeen) u.lastSeen = lastSent.get(String(u._id)) || u.updatedAt || u.createdAt || null;
    }

    const iHideReceipts = req.user.privacy?.readReceipts === false;
    const usersWithMeta = filteredUsers.map(({ privacy, blockedUsers, ...user }) => {
      const lm = lastMessageByUser.get(user._id.toString());
      const hideSeen = iHideReceipts || privacy?.readReceipts === false;
      // "Last seen" is hidden both ways when either side turned online status off.
      if (privacy?.online === false || req.user.privacy?.online === false) user.lastSeen = null;
      if (user.note && (!user.note.text || !user.note.expiresAt || new Date(user.note.expiresAt) < new Date())) user.note = null; // expired notes are gone
      return {
        ...user,
        lastMessage: lm
          ? {
              text: lm.text,
              image: lm.image,
              viewOnce: !!lm.viewOnce,
              file: lm.file,
              createdAt: lm.createdAt,
              senderId: lm.senderId,
              delivered: lm.delivered,
              seen: hideSeen && String(lm.senderId) === String(loggedInUserId) ? false : lm.seen,
            }
          : null,
        unreadCount: unreadByUser.get(user._id.toString()) || 0,
      };
    });

    usersWithMeta.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.status(200).json(usersWithMeta);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// One page of a direct chat (newest first, `before` pages back). Shared by opening a chat and the
// background prefetch. The three independent lookups run together (one round trip, not three).
async function loadDirectMessages(me, userToChatId, { limit = 80, before } = {}) {
  const myId = me._id;
  const query = {
    groupId: null,
    deletedFor: { $ne: myId },
    $or: [
      { senderId: myId, receiverId: userToChatId },
      { senderId: userToChatId, receiverId: myId },
    ],
    // disappearing messages can linger a minute before MongoDB removes them
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }],
  };
  if (before && !Number.isNaN(Date.parse(before))) query.createdAt = { $lt: new Date(before) };
  const [page, lastReply, other] = await Promise.all([
    Message.find(query).sort({ createdAt: -1 }).limit(limit).populate("replyTo", "text image file senderId").lean(),
    Message.findOne({ senderId: userToChatId, receiverId: myId, groupId: null }).sort({ createdAt: -1 }).select("createdAt").lean(),
    getUserLean(userToChatId),
  ]);
  const messages = page.reverse();

  // Self-heal old chats: anything I sent before their latest reply was obviously read.
  if (lastReply) {
    const cut = new Date(lastReply.createdAt);
    const stale = messages.filter((m) => String(m.senderId) === String(myId) && (!m.seen || !m.delivered) && new Date(m.createdAt) <= cut);
    if (stale.length) {
      for (const m of stale) {
        m.seen = true;
        m.delivered = true;
      }
      Message.updateMany(
        { senderId: myId, receiverId: userToChatId, groupId: null, createdAt: { $lte: cut }, $or: [{ seen: false }, { delivered: false }] },
        { $set: { seen: true, seenAt: cut, delivered: true, deliveredAt: cut } }
      ).catch(() => {});
    }
  }

  // Read receipts are two-way, like WhatsApp: if either of us switched them
  // off, neither of us sees "seen" on messages I sent in this chat.
  if (other?.privacy?.readReceipts === false || me.privacy?.readReceipts === false) {
    for (const m of messages) {
      if (String(m.senderId) === String(myId)) {
        m.seen = false;
        m.seenAt = null;
      }
    }
  }
  return messages;
}

export const getMessages = async (req, res) => {
  try {
    // Newest page first (fast even in very long chats); `before` loads older ones.
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    res.status(200).json(await loadDirectMessages(req.user, req.params.id, { limit, before: req.query.before }));
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Recent messages of several chats in ONE request: the app warms the top chats in the background so
// opening them later is instant.
export const prefetchMessages = async (req, res) => {
  try {
    const ids = [...new Set(String(req.query.ids || "").split(",").filter((x) => mongoose.isValidObjectId(x)))].slice(0, 8);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 60);
    const entries = await Promise.all(ids.map(async (id) => [id, await loadDirectMessages(req.user, id, { limit })]));
    res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    console.log("Error in prefetchMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// The "disappearing messages" setting of a chat, remembered briefly so sending doesn't wait on it.
const disappearCache = new Map(); // pairKey -> { seconds, vanish, at }
async function getDirectSetting(a, b) {
  const key = pairKey(a, b);
  const hit = disappearCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  const row = await DirectChatSetting.findOne({ key }).select("disappearAfter vanish").lean();
  const entry = { seconds: row?.disappearAfter || 0, vanish: !!row?.vanish, at: Date.now() };
  disappearCache.set(key, entry);
  return entry;
}
const getDisappearAfter = async (a, b) => (await getDirectSetting(a, b)).seconds;

const sendMessageCore = async (req, res) => {
  try {
    const { text, replyTo, viewOnce, forwarded } = req.body;
    let { image, file } = req.body;
    try {
      // forwarding hands back the /api/media/ address it was shown: check access, turn it into a fetchable one
      if (image) image = await resolveMediaRef(image, req.user._id);
      if (file?.data) file = { ...file, data: await resolveMediaRef(file.data, req.user._id) };
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    const poll = sanitizePoll(req.body.poll);
    const event = sanitizeEvent(req.body.event);
    const liveLocation = sanitizeLiveLocation(req.body.liveLocation);
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    const isSelf = String(senderId) === String(receiverId); // "Message yourself": a private notes chat
    // Independent lookups run together instead of one after another.
    const [contact, statusReply, receiver, disappearAfter] = await Promise.all([
      buildContact(req.body.contactUserId),
      buildStatusReply(req.body.statusId, receiverId),
      getUserLean(receiverId), // remembered for a few seconds: no database trip while chatting
      getDisappearAfter(senderId, receiverId),
    ]);

    if (!text?.trim() && !image && !file && !poll && !event && !liveLocation && !contact) {
      return res.status(400).json({ error: "Message must have text or an attachment" });
    }
    if (image && image.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(413).json({ error: "Image is too large (max 5MB)" });
    }
    if (file?.data && file.data.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({ error: "File is too large" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat-app/messages",
        type: "authenticated", // private: only reachable through the chat-checked /api/media route
        resource_type: "image",
      });
      imageUrl = uploadResponse.secure_url;
    }

    let fileAttachment;
    if (file?.data) {
      fileAttachment = await uploadFileAttachment(file);
    }

    // If the receiver currently has an active socket, the message will land
    // instantly, so we can mark it delivered right away.
    if ((req.user.blockedUsers || []).some((b) => String(b) === String(receiverId))) {
      return res.status(403).json({ error: "You blocked this contact. Unblock them to send messages." });
    }
    // They blocked me: the message is kept on my side (one tick) but never reaches them.
    const blockedByThem = !!receiver?.blockedUsers?.some((b) => String(b) === String(senderId));
    const receiverSocketId = blockedByThem ? undefined : getReceiverSocketId(receiverId);
    // "Delivered" is only recorded once the receiving device confirms it (the app
    // acks "messageReceived", or the push reaches the phone). A socket that merely
    // looks connected — e.g. the phone just lost signal — must not count.
    const isDelivered = false;

    const vanish = !isSelf && (await getDirectSetting(senderId, receiverId)).vanish;
    const newMessage = new Message({
      senderId,
      receiverId,
      vanish,
      expiresAt: disappearAfter > 0 ? new Date(Date.now() + disappearAfter * 1000) : null,
      text: poll ? `📊 ${poll.question}` : event ? `📅 ${event.title}` : liveLocation ? "📍 Live location" : contact ? `👤 ${contact.fullName}` : text?.trim() || "",
      poll: poll || undefined,
      event: event || undefined,
      liveLocation: liveLocation || undefined,
      contact: contact || undefined,
      image: viewOnce && imageUrl && !fileAttachment ? undefined : imageUrl,
      viewOnce: !!(viewOnce && imageUrl && !fileAttachment),
      viewOnceUrl: viewOnce && imageUrl && !fileAttachment ? imageUrl : undefined,
      file: fileAttachment,
      replyTo: replyTo || null,
      forwarded: forwarded === true,
      statusReply: statusReply || undefined,
      delivered: isDelivered || isSelf,
      deliveredAt: isDelivered || isSelf ? new Date() : null,
      seen: isSelf,
      seenAt: isSelf ? new Date() : null,
    });

    await newMessage.save();
    if (!isSelf) rememberMessage(newMessage); // lets "delivered" / "read" reach the sender instantly
    if (isSelf) {
      // Notes to yourself: nobody else to notify, no ticks to wait for, no push to send.
      newMessage.set("viewOnceUrl", undefined);
      if (replyTo) await newMessage.populate("replyTo", "text image file senderId");
      return res.status(201).json(newMessage);
    }
    if (!blockedByThem) markImpliedRead(senderId, receiverId, newMessage.createdAt); // replying = they have read what I sent
    newMessage.set("viewOnceUrl", undefined); // never send the hidden picture's address to anyone
    if (replyTo) await newMessage.populate("replyTo", "text image file senderId");

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    // Background push notification — reaches the recipient even if the app
    // isn't open at all, as long as they've granted notification permission.
    if (blockedByThem) return res.status(201).json(newMessage);

    sendPushToUser(receiverId, {
      title: req.user.fullName,
      body: fileAttachment ? `📎 ${fileAttachment.name}` : imageUrl ? "📷 Photo" : newMessage.text,
      icon: req.user.profilePic || "/icon-v2-192.png",
      tag: `dm-${senderId}`,
      actions: [{ action: "reply", type: "text", title: "Reply", placeholder: "Type a reply…" }],
      data: {
        url: "/",
        chatType: "direct",
        chatId: senderId.toString(),
        messageId: newMessage._id.toString(),
      },
    }, {}, `d:${senderId}`);

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// The same message may arrive twice (sent over the live connection, then re-sent over HTTP because
// no answer came back in time). `clientId` makes that harmless: the second copy gets the first one's
// result instead of creating a duplicate.
const sendDupes = new Map(); // "sender:clientId" -> Promise<{status, body}>
export const sendMessage = async (req, res) => {
  const cid = typeof req.body?.clientId === "string" ? req.body.clientId.slice(0, 64) : "";
  if (!cid) return sendMessageCore(req, res);
  const key = `${req.user._id}:${cid}`;
  const earlier = sendDupes.get(key);
  if (earlier) {
    const r = await earlier;
    return res.status(r.status).json(r.body);
  }
  let settle;
  sendDupes.set(key, new Promise((resolve) => (settle = resolve)));
  const timer = setTimeout(() => sendDupes.delete(key), 120_000);
  timer.unref?.();
  const proxy = {
    _s: 200,
    status(c) {
      this._s = c;
      res.status(c);
      return this;
    },
    json(b) {
      settle({ status: this._s, body: b });
      if (this._s >= 400) sendDupes.delete(key); // a failure may be retried
      return res.json(b);
    },
  };
  try {
    await sendMessageCore(req, proxy);
  } finally {
    settle({ status: 500, body: { error: "Internal server error" } }); // no-op if already answered
  }
};

// Toggle pin state on a message. Allowed for either participant in a direct
// chat, or any member of the group the message belongs to.
export const togglePinMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const myId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.groupId) {
      const group = await Group.findById(message.groupId);
      if (!group || !group.members.some((m) => m.equals(myId))) {
        return res.status(403).json({ error: "You are not part of this conversation" });
      }
    } else {
      const isParticipant = message.senderId.equals(myId) || message.receiverId?.equals(myId);
      if (!isParticipant) {
        return res.status(403).json({ error: "You are not part of this conversation" });
      }
    }

    const stillPinned = message.pinned && (!message.pinUntil || message.pinUntil > new Date());
    message.pinned = !stillPinned;
    const hours = [8, 24, 168].includes(Number(req.body?.hours)) ? Number(req.body.hours) : 168;
    message.pinnedAt = message.pinned ? new Date() : null;
    message.pinUntil = message.pinned ? new Date(Date.now() + hours * 3600 * 1000) : null;
    await message.save();

    const eventName = message.pinned ? "messagePinned" : "messageUnpinned";
    if (message.groupId) {
      io.to(message.groupId.toString()).emit(eventName, message);
    } else {
      [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
        const socketId = getReceiverSocketId(uid);
        if (socketId) io.to(socketId).emit(eventName, message);
      });
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in togglePinMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Mark all messages from a given sender to me as seen, and notify the sender
export const markMessagesAsSeen = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const myId = req.user._id;

    const [result, sender] = await Promise.all([
      Message.updateMany({ senderId, receiverId: myId, seen: false }, { $set: { seen: true, seenAt: new Date(), delivered: true } }),
      getUserLean(senderId),
    ]);
    const receiptsOff = req.user.privacy?.readReceipts === false || sender?.privacy?.readReceipts === false;
    if (result.modifiedCount > 0 && !receiptsOff) {
      const senderSocketId = getReceiverSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", { by: myId, count: result.modifiedCount });
      }
    }

    res.status(200).json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    console.log("Error in markMessagesAsSeen controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// "Delete for me" (hides it only in the requester's own view) or "Delete
// for everyone" (sender only — clears the content and marks it deleted for
// all participants, like WhatsApp's "This message was deleted").
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode } = req.body; // "me" | "everyone"
    const myId = req.user._id;

    if (mode !== "me" && mode !== "everyone") {
      return res.status(400).json({ error: "Invalid delete mode" });
    }

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.groupId) {
      const group = await Group.findById(message.groupId);
      if (!group || !group.members.some((m) => m.equals(myId))) {
        return res.status(403).json({ error: "You are not part of this conversation" });
      }
    } else {
      const isParticipant = message.senderId.equals(myId) || message.receiverId?.equals(myId);
      if (!isParticipant) {
        return res.status(403).json({ error: "You are not part of this conversation" });
      }
    }

    if (mode === "everyone") {
      if (!message.senderId.equals(myId)) {
        return res.status(403).json({ error: "You can only delete your own messages for everyone" });
      }
      message.deletedForEveryone = true;
      message.text = "";
      message.image = "";
      message.file = undefined;
      await message.save();

      if (message.groupId) {
        io.to(message.groupId.toString()).emit("messageDeleted", message);
      } else {
        [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
          const socketId = getReceiverSocketId(uid);
          if (socketId) io.to(socketId).emit("messageDeleted", message);
        });
      }
    } else {
      if (!message.deletedFor.some((u) => u.equals(myId))) {
        message.deletedFor.push(myId);
        await message.save();
      }
    }

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in deleteMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle starred (personal bookmark, not shared with the other participant)
export const toggleStarMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const alreadyStarred = message.starredBy.some((u) => u.equals(myId));
    if (alreadyStarred) {
      message.starredBy = message.starredBy.filter((u) => !u.equals(myId));
    } else {
      message.starredBy.push(myId);
    }
    await message.save();

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in toggleStarMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getStarredMessages = async (req, res) => {
  try {
    const myId = req.user._id;
    const query = { starredBy: myId, deletedFor: { $ne: myId }, deletedForEveryone: { $ne: true } };
    // Optional: only one chat (?chatType=group&chatId=...) for the info screen.
    const { chatType, chatId } = req.query;
    if (chatType === "group" && mongoose.isValidObjectId(chatId)) {
      if (!(await Group.exists({ _id: chatId, members: myId }))) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
      query.groupId = chatId;
    } else if (chatType === "direct" && mongoose.isValidObjectId(chatId)) {
      query.groupId = null;
      query.$or = [
        { senderId: myId, receiverId: chatId },
        { senderId: chatId, receiverId: myId },
      ];
    }
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .populate("senderId", "fullName profilePic")
      .populate("receiverId", "fullName profilePic")
      .limit(200);

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getStarredMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export { MAX_IMAGE_BASE64_LENGTH };

// Archive / unarchive a chat for the logged-in user (direct chat or group).
// Body: { chatType: "direct" | "group", chatId, archived: boolean }.
// Returns the full updated list and pushes it to all of the user's open
// devices so every screen stays in sync.
export const setChatArchived = async (req, res) => {
  try {
    const { chatType, chatId, archived } = req.body || {};
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    const key = `${chatType === "group" ? "g" : "d"}:${chatId}`;
    const update = archived ? { $addToSet: { archivedChats: key } } : { $pull: { archivedChats: key } };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("archivedChats");
    const archivedChats = user?.archivedChats || [];
    io.to(req.user._id.toString()).emit("archivedChats", archivedChats);
    res.status(200).json({ archivedChats });
  } catch (error) {
    console.log("Error in setChatArchived controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Called by the service worker the moment a push reaches a device whose app is
// closed — so the sender sees the double tick ("delivered") just like WhatsApp,
// even though the recipient never opened the app.
export const ackDelivered = async (req, res) => {
  try {
    const { messageId } = req.body || {};
    if (!mongoose.isValidObjectId(messageId)) return res.status(400).json({ error: "Invalid message" });
    const probe = await Message.findById(messageId).select("groupId").lean();
    if (probe?.groupId) {
      const member = await Group.exists({ _id: probe.groupId, members: req.user._id });
      if (member) await markGroupDelivered(io, req.user._id, { messageIds: [messageId] });
      return res.status(200).json({ ok: true });
    }
    const probeDirect = await Message.findOne({ _id: messageId, receiverId: req.user._id }).select("senderId createdAt").lean();
    if (probeDirect) {
      // this message AND everything earlier from the same person
      await markDirectDelivered(req.user._id, { senderId: probeDirect.senderId, createdAt: { $lte: probeDirect.createdAt } });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in ackDelivered controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Pin (max 3) / mute a chat for the logged-in user. Same shape as archive.
const makeChatListToggle = (field, event, max) => async (req, res) => {
  try {
    const { chatType, chatId, value } = req.body || {};
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    const key = `${chatType === "group" ? "g" : "d"}:${chatId}`;
    if (value && max) {
      const me = await User.findById(req.user._id).select(field).lean();
      const list = me?.[field] || [];
      if (!list.includes(key) && list.length >= max) {
        return res.status(400).json({ error: `You can only pin ${max} chats` });
      }
    }
    const update = value ? { $addToSet: { [field]: key } } : { $pull: { [field]: key } };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select(field);
    const list = user?.[field] || [];
    io.to(req.user._id.toString()).emit(event, list);
    res.status(200).json({ [field]: list });
  } catch (error) {
    console.log(`Error updating ${field}: `, error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
export const setChatPinned = makeChatListToggle("pinnedChats", "pinnedChats", 3);
const toggleMuted = makeChatListToggle("mutedChats", "mutedChats", 0);
// Mute / un-mute; with `until` (a future time up to a year ahead) the mute ends by itself.
export const setChatMuted = async (req, res) => {
  try {
    const { chatType, chatId, value, until } = req.body || {};
    if (["direct", "group"].includes(chatType) && mongoose.isValidObjectId(chatId)) {
      const key = `${chatType === "group" ? "g" : "d"}:${chatId}`;
      const when = value && until ? new Date(until) : null;
      await User.updateOne({ _id: req.user._id }, { $pull: { mutedUntil: { key } } });
      if (when && when.getTime() > Date.now() + 60000 && when.getTime() < Date.now() + 366 * 24 * 3600 * 1000) {
        await User.updateOne({ _id: req.user._id }, { $push: { mutedUntil: { key, until: when } } });
      }
    }
  } catch (error) {
    console.log("Error saving timed mute:", error.message);
  }
  return toggleMuted(req, res);
};
export const setChatMarkedUnread = makeChatListToggle("markedUnread", "markedUnread", 0);

// Replace the user's chat lists (Favourites + custom lists) in one go.
// Body: { lists: [{ id, name, chats: ["d:<id>" | "g:<id>"] }] }
const CHAT_KEY = /^[dg]:[a-f0-9]{24}$/i;
export const setChatLists = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.lists) ? req.body.lists : null;
    if (!raw || raw.length > 11) return res.status(400).json({ error: "Invalid lists" });
    const seen = new Set();
    const lists = [];
    for (const l of raw) {
      const id = String(l?.id || "").slice(0, 40);
      const name = String(l?.name || "").trim().slice(0, 30);
      if (!id || !name || seen.has(id)) return res.status(400).json({ error: "Invalid list" });
      seen.add(id);
      const chats = [...new Set((Array.isArray(l.chats) ? l.chats : []).map(String))].filter((k) => CHAT_KEY.test(k));
      if (chats.length > 1000) return res.status(400).json({ error: "List too large" });
      lists.push({ id, name, chats });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { chatLists: lists } }, { new: true }).select("chatLists");
    const chatLists = user?.chatLists || [];
    io.to(req.user._id.toString()).emit("chatLists", chatLists);
    res.status(200).json({ chatLists });
  } catch (error) {
    console.log("Error in setChatLists controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a chat for me: every message in it is hidden from my side only (the
// other person / group members keep theirs), like WhatsApp's "Delete chat".
export const deleteChatForMe = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;
    const myId = req.user._id;
    // "Clear chat" can keep the messages I starred.
    const keepStarred = req.query.keepStarred === "1";
    const unstarred = keepStarred ? { starredBy: { $ne: myId } } : {};
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    if (chatType === "group") {
      const isMember = await Group.exists({ _id: chatId, members: myId });
      if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });
      await Message.updateMany({ groupId: chatId, ...unstarred }, { $addToSet: { deletedFor: myId } });
    } else {
      await Message.updateMany(
        {
          groupId: null,
          ...unstarred,
          $or: [
            { senderId: myId, receiverId: chatId },
            { senderId: chatId, receiverId: myId },
          ],
        },
        { $addToSet: { deletedFor: myId } }
      );
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in deleteChatForMe controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Shared media for a chat's info screen: photos & videos, documents, links.
export const getChatMedia = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;
    const myId = req.user._id;
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    let scope;
    if (chatType === "group") {
      const isMember = await Group.exists({ _id: chatId, members: myId });
      if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });
      scope = { groupId: chatId };
    } else {
      scope = {
        groupId: null,
        $or: [
          { senderId: myId, receiverId: chatId },
          { senderId: chatId, receiverId: myId },
        ],
      };
    }
    const visible = { ...scope, deletedFor: { $ne: myId }, deletedForEveryone: { $ne: true } };
    const pick = "image file text senderId createdAt";
    const [media, docs, linkMsgs] = await Promise.all([
      Message.find({ ...visible, $or: [{ image: { $nin: ["", null] } }, { "file.type": "video", "file.url": { $nin: ["", null] } }] }) // ($ne: "" also matched every message with no image at all)
        .sort({ createdAt: -1 }).limit(300).select(pick).lean(),
      Message.find({ ...visible, "file.type": "document" }).sort({ createdAt: -1 }).limit(200).select(pick).lean(),
      Message.find({ ...visible, text: /https?:\/\//i }).sort({ createdAt: -1 }).limit(200).select(pick).lean(),
    ]);
    const links = [];
    for (const m of linkMsgs) {
      for (const url of m.text.match(/https?:\/\/[^\s<>"']+/gi) || []) {
        links.push({ _id: `${m._id}-${links.length}`, url, text: m.text, createdAt: m.createdAt, senderId: m.senderId });
      }
    }
    res.status(200).json({
      media: media
        .filter((m) => m.image || (m.file?.type === "video" && m.file?.url))
        .map((m) => ({
          _id: m._id,
          createdAt: m.createdAt,
          kind: m.image ? "image" : "video",
          url: m.image || m.file?.url,
          duration: m.file?.duration,
        })),
      docs: docs.map((m) => ({ _id: m._id, createdAt: m.createdAt, name: m.file?.name, size: m.file?.size, url: m.file?.url })),
      links,
    });
  } catch (error) {
    console.log("Error in getChatMedia controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Search message text. Everywhere the person can see (default), or inside one
// chat (?chatType=direct|group&chatId=...). Never returns messages they deleted
// for themselves or for everyone.
export const searchMessages = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const kind = ["docs", "links", "photos"].includes(req.query.kind) ? req.query.kind : "";
    if (q.length > 100 || (!kind && q.length < 2)) return res.status(200).json([]);
    const myId = req.user._id;
    const { chatType, chatId } = req.query;
    const rx = q ? new RegExp(escapeRegex(q), "i") : null; // literal match, so no regex injection

    let scope;
    if (chatType === "direct" && mongoose.isValidObjectId(chatId)) {
      scope = {
        groupId: null,
        $or: [
          { senderId: myId, receiverId: chatId },
          { senderId: chatId, receiverId: myId },
        ],
      };
    } else if (chatType === "group" && mongoose.isValidObjectId(chatId)) {
      const isMember = await Group.exists({ _id: chatId, members: myId });
      if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });
      scope = { groupId: chatId };
    } else {
      const groups = await Group.find({ members: myId }).select("_id").lean();
      scope = {
        $or: [
          { groupId: null, $or: [{ senderId: myId }, { receiverId: myId }] },
          { groupId: { $in: groups.map((g) => g._id) } },
        ],
      };
    }

    // Documents / Links / Photos filters (the chips on WhatsApp's search screen)
    let match;
    if (kind === "links") {
      const linkRx = /(https?:\/\/|www\.)/i;
      match = rx ? { $and: [{ text: linkRx }, { text: rx }] } : { text: linkRx };
    } else if (kind === "photos") {
      match = { image: { $nin: ["", null] }, ...(rx ? { text: rx } : {}) };
    } else if (kind === "docs") {
      match = { "file.type": "document", ...(rx ? { $or: [{ "file.name": rx }, { text: rx }] } : {}) };
    } else {
      match = { $or: [{ text: rx }, { "file.name": rx }] };
    }

    // Locked chats never show up in the all-chats search (only inside the chat itself)
    const scoped = chatType === "direct" || chatType === "group";
    const lockedSet = scoped ? null : new Set((await User.findById(myId).select("lockedChats").lean())?.lockedChats || []);

    const found = await Message.find({
      $and: [scope, match],
      deletedFor: { $ne: myId },
      deletedForEveryone: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(60)
      .select("text image file.name file.type senderId receiverId groupId createdAt")
      .lean();

    const visible = lockedSet
      ? found.filter((msg) => {
          const other = msg.groupId ? `g:${msg.groupId}` : `d:${String(msg.senderId) === String(myId) ? msg.receiverId : msg.senderId}`;
          return !lockedSet.has(other);
        })
      : found;

    res.status(200).json(
      visible.map((msg) => ({
        _id: msg._id,
        text: msg.text,
        image: msg.image || "",
        file: msg.file?.name ? { name: msg.file.name, type: msg.file.type } : null,
        createdAt: msg.createdAt,
        senderId: msg.senderId,
        chatType: msg.groupId ? "group" : "direct",
        chatId: msg.groupId || (String(msg.senderId) === String(myId) ? msg.receiverId : msg.senderId),
      }))
    );
  } catch (error) {
    console.log("Error in searchMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Vote in a poll (choose / change / clear). Body: { optionIds: [...] }
// RSVP to an event message: going / maybe / no (answering again replaces the earlier answer).
export const rsvpEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    const field = { going: "going", maybe: "maybe", no: "declined" }[req.body?.answer];
    if (!field) return res.status(400).json({ error: "Invalid answer" });
    const message = await Message.findById(id).select("event senderId receiverId groupId deletedForEveryone");
    if (!message?.event || message.deletedForEveryone) return res.status(404).json({ error: "Event not found" });
    if (message.groupId) {
      if (!(await Group.exists({ _id: message.groupId, members: myId }))) return res.status(403).json({ error: "Not a member" });
    } else if (![message.senderId, message.receiverId].some((u) => String(u) === String(myId))) {
      return res.status(403).json({ error: "Not allowed" });
    }
    for (const f of ["going", "maybe", "declined"]) message.event[f] = message.event[f].filter((u) => String(u) !== String(myId));
    message.event[field].push(myId);
    await message.save();
    const payload = { _id: message._id, event: message.event };
    if (message.groupId) {
      io.to(message.groupId.toString()).emit("messageEvent", payload);
    } else {
      [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
        const socketId = getReceiverSocketId(uid);
        if (socketId) io.to(socketId).emit("messageEvent", payload);
      });
    }
    res.status(200).json(payload);
  } catch (error) {
    console.log("Error in rsvpEvent controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Live location: only the sender moves it. Everyone in the chat gets the new position live.
const liveRecipients = (message) => {
  if (message.groupId) return null;
  return [message.senderId.toString(), message.receiverId.toString()];
};
const emitLive = (message, payload) => {
  if (message.groupId) return io.to(message.groupId.toString()).emit("messageLive", payload);
  liveRecipients(message).forEach((uid) => {
    const socketId = getReceiverSocketId(uid);
    if (socketId) io.to(socketId).emit("messageLive", payload);
  });
};
const liveLastPush = new Map(); // messageId -> ms of the last accepted update (keeps a runaway client from flooding)

export const updateLiveLocation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    const stop = req.path.endsWith("/stop");
    const pos = stop ? null : cleanPosition(req.body);
    if (!stop && !pos) return res.status(400).json({ error: "Invalid position" });
    const message = await Message.findById(id).select("liveLocation senderId receiverId groupId deletedForEveryone");
    if (!message?.liveLocation || message.deletedForEveryone) return res.status(404).json({ error: "Live location not found" });
    if (String(message.senderId) !== String(req.user._id)) return res.status(403).json({ error: "Not allowed" });
    const live = message.liveLocation;
    const expired = new Date(live.expiresAt).getTime() <= Date.now();
    if (!live.active || expired) {
      if (live.active) {
        message.liveLocation.active = false;
        await message.save();
        emitLive(message, { _id: message._id, liveLocation: message.liveLocation });
      }
      return res.status(200).json({ _id: message._id, liveLocation: message.liveLocation });
    }
    if (!stop) {
      const last = liveLastPush.get(id) || 0;
      if (Date.now() - last < 3000) return res.status(200).json({ _id: message._id, liveLocation: message.liveLocation, skipped: true });
      liveLastPush.set(id, Date.now());
      Object.assign(message.liveLocation, pos, { updatedAt: new Date() });
    } else {
      message.liveLocation.active = false;
      message.liveLocation.updatedAt = new Date();
      liveLastPush.delete(id);
    }
    message.markModified("liveLocation");
    await message.save();
    const payload = { _id: message._id, liveLocation: message.liveLocation };
    emitLive(message, payload);
    res.status(200).json(payload);
  } catch (error) {
    console.log("Error in updateLiveLocation controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const votePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    const message = await Message.findById(id).select("poll senderId receiverId groupId deletedForEveryone");
    if (!message?.poll || message.deletedForEveryone) return res.status(404).json({ error: "Poll not found" });
    if (message.groupId) {
      if (!(await Group.exists({ _id: message.groupId, members: myId }))) return res.status(403).json({ error: "Not a member" });
    } else if (![message.senderId, message.receiverId].some((u) => String(u) === String(myId))) {
      return res.status(403).json({ error: "Not allowed" });
    }
    let chosen = [...new Set((Array.isArray(req.body?.optionIds) ? req.body.optionIds : []).map(String))];
    chosen = chosen.filter((oid) => message.poll.options.some((o) => String(o._id) === oid));
    if (!message.poll.multiple) chosen = chosen.slice(0, 1);
    for (const o of message.poll.options) {
      o.votes = o.votes.filter((v) => String(v) !== String(myId));
      if (chosen.includes(String(o._id))) o.votes.push(myId);
    }
    await message.save();
    const payload = { _id: message._id, poll: message.poll };
    if (message.groupId) {
      io.to(message.groupId.toString()).emit("messagePoll", payload);
    } else {
      [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
        const socketId = getReceiverSocketId(uid);
        if (socketId) io.to(socketId).emit("messagePoll", payload);
      });
    }
    res.status(200).json(payload);
  } catch (error) {
    console.log("Error in votePoll controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Open a view-once photo: only the receiver, only once. The picture is handed
// over in this response and then removed from the server.
export const openViewOnce = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    const message = await Message.findOne({ _id: id, receiverId: req.user._id, viewOnce: true, viewOnceOpened: false })
      .select("+viewOnceUrl senderId receiverId");
    if (!message || !message.viewOnceUrl) return res.status(404).json({ error: "This photo has already been opened" });
    const url = message.viewOnceUrl;
    // claim it atomically so two devices can't both open it
    const claimed = await Message.findOneAndUpdate(
      { _id: id, viewOnceOpened: false },
      { $set: { viewOnceOpened: true }, $unset: { viewOnceUrl: 1 } }
    );
    if (!claimed) return res.status(404).json({ error: "This photo has already been opened" });
    [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
      const socketId = getReceiverSocketId(uid);
      if (socketId) io.to(socketId).emit("messageViewOnce", { _id: id });
    });
    res.locals.noMask = true; // this one is the real (signed) address, shown once
    res.status(200).json({ image: deliveryUrl(url) });
  } catch (error) {
    console.log("Error in openViewOnce controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Edit your own text message within 15 minutes (like WhatsApp).
const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const text = String(req.body?.text ?? "").trim();
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    if (!text || text.length > 5000) return res.status(400).json({ error: "Message can't be empty" });
    const message = await Message.findById(id);
    if (!message || message.deletedForEveryone) return res.status(404).json({ error: "Message not found" });
    if (String(message.senderId) !== String(req.user._id)) return res.status(403).json({ error: "You can only edit your own messages" });
    if (message.file?.url) return res.status(400).json({ error: "This message can't be edited" });
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS)
      return res.status(400).json({ error: "You can only edit a message within 15 minutes" });
    if (message.text === text) return res.status(200).json({ _id: message._id, text, editedAt: message.editedAt });
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    const payload = { _id: message._id, text, editedAt: message.editedAt, senderId: message.senderId, receiverId: message.receiverId, groupId: message.groupId };
    if (message.groupId) {
      io.to(message.groupId.toString()).emit("messageEdited", payload);
    } else {
      [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
        const socketId = getReceiverSocketId(uid);
        if (socketId) io.to(socketId).emit("messageEdited", payload);
      });
    }
    res.status(200).json(payload);
  } catch (error) {
    console.log("Error in editMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// React to a message with one emoji (sending the same emoji again, or null, removes it).
export const reactToMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const myId = req.user._id;
    let { emoji } = req.body || {};
    if (!mongoose.isValidObjectId(messageId)) return res.status(400).json({ error: "Invalid message" });
    if (emoji != null && (typeof emoji !== "string" || emoji.length > 16 || !/\p{Extended_Pictographic}/u.test(emoji))) {
      return res.status(400).json({ error: "Invalid reaction" });
    }

    const message = await Message.findById(messageId).select("senderId receiverId groupId reactions deletedForEveryone");
    if (!message || message.deletedForEveryone) return res.status(404).json({ error: "Message not found" });

    if (message.groupId) {
      const isMember = await Group.exists({ _id: message.groupId, members: myId });
      if (!isMember) return res.status(403).json({ error: "You are not part of this conversation" });
    } else if (!message.senderId.equals(myId) && !message.receiverId?.equals(myId)) {
      return res.status(403).json({ error: "You are not part of this conversation" });
    }

    const existing = message.reactions.find((r) => r.user.equals(myId));
    message.reactions = message.reactions.filter((r) => !r.user.equals(myId));
    if (emoji && existing?.emoji !== emoji) message.reactions.push({ user: myId, emoji });
    await message.save();

    const payload = { _id: message._id, reactions: message.reactions };
    if (message.groupId) {
      io.to(message.groupId.toString()).emit("messageReacted", payload);
    } else {
      [message.senderId.toString(), message.receiverId.toString()].forEach((uid) => {
        const socketId = getReceiverSocketId(uid);
        if (socketId) io.to(socketId).emit("messageReacted", payload);
      });
    }
    res.status(200).json(payload);
  } catch (error) {
    console.log("Error in reactToMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


// ---- Privacy settings + blocking ----
export const updatePrivacy = async (req, res) => {
  try {
    const set = {};
    for (const k of ["readReceipts", "typing", "online"]) {
      if (typeof req.body?.[k] === "boolean") set[`privacy.${k}`] = req.body[k];
    }
    if (!Object.keys(set).length) return res.status(400).json({ error: "Nothing to update" });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true }).select("privacy blockedUsers");
    setPrivacyCache(req.user._id, user);
    if ("privacy.online" in set) refreshOnline();
    io.to(req.user._id.toString()).emit("privacy", user.privacy);
    res.status(200).json({ privacy: user.privacy });
  } catch (error) {
    console.log("Error in updatePrivacy controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setUserBlocked = async (req, res) => {
  try {
    const { userId, blocked } = req.body || {};
    if (!mongoose.isValidObjectId(userId) || String(userId) === String(req.user._id)) {
      return res.status(400).json({ error: "Invalid contact" });
    }
    const update = blocked ? { $addToSet: { blockedUsers: userId } } : { $pull: { blockedUsers: userId } };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("privacy blockedUsers");
    setPrivacyCache(req.user._id, user);
    io.to(req.user._id.toString()).emit("blockedUsers", user.blockedUsers);
    res.status(200).json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    console.log("Error in setUserBlocked controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---- Storage per chat + chat backup ----
const myMessageFilter = async (me) => {
  const groupIds = (await Group.find({ members: me }).select("_id").lean()).map((g) => g._id);
  return {
    deletedFor: { $ne: me },
    deletedForEveryone: { $ne: true },
    $or: [{ senderId: me }, { receiverId: me }, { groupId: { $in: groupIds } }],
  };
};

export const getStorageUsage = async (req, res) => {
  try {
    const me = req.user._id;
    const rows = await Message.aggregate([
      { $match: await myMessageFilter(me) },
      {
        $group: {
          _id: {
            $cond: [{ $ifNull: ["$groupId", false] }, { $concat: ["g:", { $toString: "$groupId" }] },
              { $concat: ["d:", { $toString: { $cond: [{ $eq: ["$senderId", me] }, "$receiverId", "$senderId"] } }] }],
          },
          messages: { $sum: 1 },
          photos: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$image", ""] } }, 0] }, 1, 0] } },
          files: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$file.url", ""] } }, 0] }, 1, 0] } },
          fileBytes: { $sum: { $ifNull: ["$file.size", 0] } },
        },
      },
      { $sort: { messages: -1 } },
      { $limit: 200 },
    ]);
    res.status(200).json(rows.map((r) => ({ key: r._id, messages: r.messages, photos: r.photos, files: r.files, fileBytes: r.fileBytes })));
  } catch (error) {
    console.log("Error in getStorageUsage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Download my chats as JSON. `?chat=d:<id>|g:<id>` limits it to one chat.
export const exportChats = async (req, res) => {
  try {
    const me = req.user._id;
    const only = typeof req.query.chat === "string" && /^[dg]:[a-f0-9]{24}$/i.test(req.query.chat) ? req.query.chat : null;
    const filter = await myMessageFilter(me);
    if (only) {
      const id = only.slice(2);
      filter.$or = only[0] === "g" ? [{ groupId: id }] : [{ senderId: me, receiverId: id }, { senderId: id, receiverId: me }];
    }
    const msgs = await Message.find(filter)
      .sort({ createdAt: 1 })
      .limit(100000)
      .select("senderId receiverId groupId text image file createdAt")
      .lean();
    const [users, groups] = await Promise.all([
      User.find({}).select("fullName").lean(),
      Group.find({ members: me }).select("name").lean(),
    ]);
    const nameOf = new Map([...users.map((u) => [String(u._id), u.fullName]), ...groups.map((g) => [String(g._id), g.name])]);
    const chats = new Map();
    for (const m of msgs) {
      const key = m.groupId ? `g:${m.groupId}` : `d:${String(m.senderId) === String(me) ? m.receiverId : m.senderId}`;
      if (!chats.has(key)) chats.set(key, { chat: nameOf.get(key.slice(2)) || "Unknown", type: key[0] === "g" ? "group" : "direct", messages: [] });
      chats.get(key).messages.push({
        at: m.createdAt,
        from: String(m.senderId) === String(me) ? "You" : nameOf.get(String(m.senderId)) || "Unknown",
        text: m.text || undefined,
        photo: m.image || undefined,
        file: m.file?.url ? { name: m.file.name, url: m.file.url } : undefined,
      });
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="talkies-chats-${new Date().toISOString().slice(0, 10)}.json"`);
    res.status(200).send(JSON.stringify({ exportedAt: new Date(), exportedBy: req.user.fullName, chats: [...chats.values()] }, null, 2));
  } catch (error) {
    console.log("Error in exportChats controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Vanish mode (Instagram): either person can switch it on/off for the chat; messages sent while it is on
// disappear for both once the person they were sent to has read them and left the chat.
export const setDirectVanish = async (req, res) => {
  try {
    const otherId = req.params.id;
    if (!mongoose.isValidObjectId(otherId)) return res.status(400).json({ error: "Invalid user" });
    const on = req.body?.on === true;
    await DirectChatSetting.findOneAndUpdate({ key: pairKey(req.user._id, otherId) }, { $set: { vanish: on } }, { upsert: true });
    disappearCache.delete(pairKey(req.user._id, otherId));
    for (const [uid, peer] of [[otherId, req.user._id], [req.user._id, otherId]]) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("directVanish", { userId: String(peer), on });
    }
    res.status(200).json({ on });
  } catch (error) {
    console.log("Error in setDirectVanish controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// The reader left the chat: what was sent to them in Vanish mode and has been seen is deleted for both.
export const clearVanish = async (req, res) => {
  try {
    const otherId = req.params.id;
    if (!mongoose.isValidObjectId(otherId)) return res.status(400).json({ error: "Invalid user" });
    const filter = { vanish: true, seen: true, groupId: null, senderId: otherId, receiverId: req.user._id };
    const rows = await Message.find(filter).select("_id").lean();
    if (!rows.length) return res.status(200).json({ ids: [] });
    const ids = rows.map((r) => String(r._id));
    await Message.deleteMany({ _id: { $in: ids } });
    for (const uid of [otherId, String(req.user._id)]) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("vanishCleared", { ids });
    }
    res.status(200).json({ ids });
  } catch (error) {
    console.log("Error in clearVanish controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const DIRECT_DISAPPEAR_OPTIONS = [0, 24 * 3600, 7 * 24 * 3600, 90 * 24 * 3600];

export const getDirectDisappearing = async (req, res) => {
  try {
    const doc = await DirectChatSetting.findOne({ key: pairKey(req.user._id, req.params.id) }).select("disappearAfter vanish").lean();
    res.status(200).json({ seconds: doc?.disappearAfter || 0, vanish: !!doc?.vanish });
  } catch (error) {
    console.log("Error in getDirectDisappearing controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Either person can switch disappearing messages on/off; applies to messages sent from now on.
export const setDirectDisappearing = async (req, res) => {
  try {
    const seconds = Number(req.body?.seconds);
    if (!DIRECT_DISAPPEAR_OPTIONS.includes(seconds)) return res.status(400).json({ error: "Invalid duration" });
    const otherId = req.params.id;
    if (!mongoose.isValidObjectId(otherId)) return res.status(400).json({ error: "Invalid user" });
    await DirectChatSetting.findOneAndUpdate(
      { key: pairKey(req.user._id, otherId) },
      { $set: { disappearAfter: seconds } },
      { upsert: true }
    );
    disappearCache.delete(pairKey(req.user._id, otherId));
    const sid = getReceiverSocketId(otherId);
    if (sid) io.to(sid).emit("directDisappearing", { userId: String(req.user._id), seconds });
    res.status(200).json({ seconds });
  } catch (error) {
    console.log("Error in setDirectDisappearing controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const linkPreview = async (req, res) => {
  try {
    const url = String(req.query.url || "").slice(0, 2000);
    const data = url ? await getLinkPreview(url) : null;
    res.set("Cache-Control", "private, max-age=3600");
    res.status(200).json(data || {});
  } catch (error) {
    res.status(200).json({});
  }
};

// ---- Voice message transcripts ----
// Turns a voice note into text with a Whisper-compatible speech service (Groq's free tier or OpenAI).
// Set GROQ_API_KEY (or OPENAI_API_KEY) on the server. The text is saved on the message, so each note is
// transcribed once and both people see it.
const MAX_TRANSCRIBE_BYTES = 24 * 1024 * 1024;
export const transcribeMessage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid message" });
    const message = await Message.findById(id);
    if (!message || message.file?.type !== "audio" || !message.file?.url || message.deletedForEveryone) {
      return res.status(404).json({ error: "Voice message not found" });
    }
    const me = req.user._id;
    if (message.groupId) {
      const member = await Group.exists({ _id: message.groupId, members: me });
      if (!member) return res.status(403).json({ error: "Not allowed" });
    } else if (!message.senderId.equals(me) && !message.receiverId?.equals(me)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    if (message.transcript?.text) return res.status(200).json({ text: message.transcript.text });

    const groq = process.env.GROQ_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    if (!groq && !openai) return res.status(501).json({ error: "not_configured" });

    const audio = await fetch(deliveryUrl(message.file.url));
    if (!audio.ok) return res.status(502).json({ error: "Couldn't load that voice message" });
    const buf = Buffer.from(await audio.arrayBuffer());
    if (!buf.length || buf.length > MAX_TRANSCRIBE_BYTES) return res.status(413).json({ error: "That voice message is too long to transcribe" });

    const mime = message.file.mimeType || audio.headers.get("content-type") || "audio/webm";
    const ext = /mp4|m4a|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), `voice.${ext}`);
    form.append("model", groq ? "whisper-large-v3-turbo" : "whisper-1");
    form.append("response_format", "json");
    const r = await fetch(groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groq || openai}` },
      body: form,
    });
    if (!r.ok) {
      console.log("Transcribe failed:", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return res.status(502).json({ error: "The speech service couldn't read that voice message" });
    }
    const text = String((await r.json())?.text || "").trim().slice(0, 4000);
    if (!text) return res.status(200).json({ text: "", empty: true });
    message.transcript = { text, at: new Date() };
    await message.save();
    res.status(200).json({ text });
  } catch (error) {
    console.log("Error in transcribeMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// "Search by date": the first message of a chat on or after a given moment (the start of the chosen day).
export const firstMessageFrom = async (req, res) => {
  try {
    const { chatType, chatId } = req.query;
    const from = new Date(String(req.query.from || ""));
    if (Number.isNaN(from.getTime())) return res.status(400).json({ error: "Pick a date" });
    const myId = req.user._id;
    let scope;
    if (chatType === "direct" && mongoose.isValidObjectId(chatId)) {
      scope = {
        groupId: null,
        $or: [
          { senderId: myId, receiverId: chatId },
          { senderId: chatId, receiverId: myId },
        ],
      };
    } else if (chatType === "group" && mongoose.isValidObjectId(chatId)) {
      if (!(await Group.exists({ _id: chatId, members: myId }))) return res.status(403).json({ error: "You are not a member of this group" });
      scope = { groupId: chatId };
    } else {
      return res.status(400).json({ error: "Open a chat first" });
    }
    const m = await Message.findOne({
      ...scope,
      createdAt: { $gte: from },
      deletedFor: { $ne: myId },
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }],
    })
      .sort({ createdAt: 1 })
      .select("_id createdAt")
      .lean();
    if (!m) return res.status(404).json({ error: "No messages on or after that date" });
    res.status(200).json({ id: m._id, createdAt: m.createdAt });
  } catch (error) {
    console.log("Error in firstMessageFrom:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---- Sending over the live connection ----
// A text message used to travel as a separate HTTP request (new request, cookie check, user lookup…).
// The phone already has an authenticated live connection open, so plain messages go through it
// instead: same logic (it calls the very same sendMessage), noticeably faster.
onSocketConnection((socket) => {
  socket.on("sendDirect", async (payload, ack) => {
    if (typeof ack !== "function") return;
    try {
      const to = String(payload?.to || "");
      if (!mongoose.isValidObjectId(to)) return ack({ status: 400, body: { error: "Invalid chat" } });
      const user = await getUserDoc(socket.data.userId);
      if (!user || user.deleted) return ack({ status: 401, body: { error: "Unauthorized" } });
      let status = 200;
      const res = {
        status(c) {
          status = c;
          return this;
        },
        json(body) {
          ack({ status, body });
          return this;
        },
      };
      await sendMessage({ body: payload?.body || {}, params: { id: to }, user }, res);
    } catch (e) {
      console.log("Error in sendDirect:", e.message);
      ack({ status: 500, body: { error: "Internal server error" } });
    }
  });
});
