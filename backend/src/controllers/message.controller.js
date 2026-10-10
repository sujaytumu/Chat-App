import mongoose from "mongoose";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { sanitizePoll } from "../lib/poll.js";
import { buildContact } from "../lib/contactCard.js";
import { markGroupDelivered } from "../lib/groupReceipts.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io, setPrivacyCache, refreshOnline } from "../lib/socket.js";
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
      .select("-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled")
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

    const iHideReceipts = req.user.privacy?.readReceipts === false;
    const usersWithMeta = filteredUsers.map(({ privacy, blockedUsers, ...user }) => {
      const lm = lastMessageByUser.get(user._id.toString());
      const hideSeen = iHideReceipts || privacy?.readReceipts === false;
      // "Last seen" is hidden both ways when either side turned online status off.
      if (privacy?.online === false || req.user.privacy?.online === false) user.lastSeen = null;
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

    // Read receipts are two-way, like WhatsApp: if either of us switched them
    // off, neither of us sees "seen" on messages I sent in this chat.
    const other = await User.findById(userToChatId).select("privacy").lean();
    if (other?.privacy?.readReceipts === false || req.user.privacy?.readReceipts === false) {
      for (const m of messages) {
        if (String(m.senderId) === String(myId)) {
          m.seen = false;
          m.seenAt = null;
        }
      }
    }

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, file, replyTo, viewOnce } = req.body;
    const poll = sanitizePoll(req.body.poll);
    const contact = await buildContact(req.body.contactUserId);
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text?.trim() && !image && !file && !poll && !contact) {
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
    const receiver = await User.findById(receiverId).select("blockedUsers").lean();
    if ((req.user.blockedUsers || []).some((b) => String(b) === String(receiverId))) {
      return res.status(403).json({ error: "You blocked this contact. Unblock them to send messages." });
    }
    // They blocked me: the message is kept on my side (one tick) but never reaches them.
    const blockedByThem = !!receiver?.blockedUsers?.some((b) => String(b) === String(senderId));
    const receiverSocketId = blockedByThem ? undefined : getReceiverSocketId(receiverId);
    const isDelivered = !!receiverSocketId;

    const newMessage = new Message({
      senderId,
      receiverId,
      text: poll ? `📊 ${poll.question}` : contact ? `👤 ${contact.fullName}` : text?.trim() || "",
      poll: poll || undefined,
      contact: contact || undefined,
      image: viewOnce && imageUrl && !fileAttachment ? undefined : imageUrl,
      viewOnce: !!(viewOnce && imageUrl && !fileAttachment),
      viewOnceUrl: viewOnce && imageUrl && !fileAttachment ? imageUrl : undefined,
      file: fileAttachment,
      replyTo: replyTo || null,
      delivered: isDelivered,
      deliveredAt: isDelivered ? new Date() : null,
    });

    await newMessage.save();
    newMessage.set("viewOnceUrl", undefined); // never send the hidden picture's address to anyone
    await newMessage.populate("replyTo", "text image file senderId");

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

    const sender = result.modifiedCount > 0 ? await User.findById(senderId).select("privacy").lean() : null;
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

    const found = await Message.find({
      $and: [scope, match],
      deletedFor: { $ne: myId },
      deletedForEveryone: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(60)
      .select("text image file.name file.type senderId receiverId groupId createdAt")
      .lean();

    res.status(200).json(
      found.map((msg) => ({
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
    res.status(200).json({ image: url });
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
