import mongoose from "mongoose";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { markGroupDelivered } from "../lib/groupReceipts.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { uploadFileAttachment, MAX_BASE64_LENGTH } from "../lib/uploadFile.js";
import { sendPushToUser } from "../lib/webPush.js";

// Max base64 image payload accepted (~6.5MB decodes to ~5MB image)
const MAX_IMAGE_BASE64_LENGTH = 6.5 * 1024 * 1024;

// Sidebar: direct-message contacts, each with last message + unread count.
// Uses two aggregations (not one query per contact) so this stays fast
// regardless of how many contacts/messages exist.
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } })
      .select("-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats")
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

    const usersWithMeta = filteredUsers.map((user) => {
      const lm = lastMessageByUser.get(user._id.toString());
      return {
        ...user,
        lastMessage: lm
          ? {
              text: lm.text,
              image: lm.image,
              file: lm.file,
              createdAt: lm.createdAt,
              senderId: lm.senderId,
              delivered: lm.delivered,
              seen: lm.seen,
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

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    // Newest page first (fast even in very long chats); `before` loads older ones.
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const query = {
      groupId: null,
      deletedFor: { $ne: myId },
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    };
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) {
      query.createdAt = { $lt: new Date(req.query.before) };
    }
    const page = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("replyTo", "text image file senderId")
      .lean();
    const messages = page.reverse();

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, file, replyTo } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text?.trim() && !image && !file) {
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
    const receiverSocketId = getReceiverSocketId(receiverId);
    const isDelivered = !!receiverSocketId;

    const newMessage = new Message({
      senderId,
      receiverId,
      text: text?.trim() || "",
      image: imageUrl,
      file: fileAttachment,
      replyTo: replyTo || null,
      delivered: isDelivered,
      deliveredAt: isDelivered ? new Date() : null,
    });

    await newMessage.save();
    await newMessage.populate("replyTo", "text image file senderId");

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    // Background push notification — reaches the recipient even if the app
    // isn't open at all, as long as they've granted notification permission.
    sendPushToUser(receiverId, {
      title: req.user.fullName,
      body: fileAttachment ? `📎 ${fileAttachment.name}` : imageUrl ? "📷 Photo" : newMessage.text,
      icon: req.user.profilePic || "/icon-v2-192.png",
      tag: `dm-${senderId}`,
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

    message.pinned = !message.pinned;
    message.pinnedAt = message.pinned ? new Date() : null;
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

    const result = await Message.updateMany(
      { senderId, receiverId: myId, seen: false },
      { $set: { seen: true, seenAt: new Date(), delivered: true } }
    );

    if (result.modifiedCount > 0) {
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
    const msg = await Message.findOneAndUpdate(
      { _id: messageId, receiverId: req.user._id, delivered: false },
      { $set: { delivered: true, deliveredAt: new Date() } },
      { new: true }
    ).select("senderId");
    if (msg) {
      const senderRoom = getReceiverSocketId(msg.senderId.toString());
      if (senderRoom) io.to(senderRoom).emit("messagesDelivered", { by: req.user._id.toString() });
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
export const setChatMuted = makeChatListToggle("mutedChats", "mutedChats", 0);

// Delete a chat for me: every message in it is hidden from my side only (the
// other person / group members keep theirs), like WhatsApp's "Delete chat".
export const deleteChatForMe = async (req, res) => {
  try {
    const { chatType, chatId } = req.params;
    const myId = req.user._id;
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    if (chatType === "group") {
      const isMember = await Group.exists({ _id: chatId, members: myId });
      if (!isMember) return res.status(403).json({ error: "You are not a member of this group" });
      await Message.updateMany({ groupId: chatId }, { $addToSet: { deletedFor: myId } });
    } else {
      await Message.updateMany(
        {
          groupId: null,
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
      Message.find({ ...visible, $or: [{ image: { $ne: "" } }, { "file.type": "video" }] })
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
      media: media.map((m) => ({
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
    if (q.length < 2 || q.length > 100) return res.status(200).json([]);
    const myId = req.user._id;
    const { chatType, chatId } = req.query;
    const rx = new RegExp(escapeRegex(q), "i"); // literal match, so no regex injection

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

    const found = await Message.find({
      $and: [scope],
      text: rx,
      deletedFor: { $ne: myId },
      deletedForEveryone: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(40)
      .select("text senderId receiverId groupId createdAt")
      .lean();

    res.status(200).json(
      found.map((msg) => ({
        _id: msg._id,
        text: msg.text,
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
