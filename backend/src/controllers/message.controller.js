import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";

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
      .select("-password")
      .lean();

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate([
        {
          $match: {
            groupId: null,
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
          },
        },
      ]),
      Message.aggregate([
        { $match: { receiverId: loggedInUserId, groupId: null, seen: false } },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ]),
    ]);

    const lastMessageByUser = new Map(lastMessages.map((m) => [m._id.toString(), m]));
    const unreadByUser = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

    const usersWithMeta = filteredUsers.map((user) => {
      const lm = lastMessageByUser.get(user._id.toString());
      return {
        ...user,
        lastMessage: lm ? { text: lm.text, image: lm.image, file: lm.file, createdAt: lm.createdAt, senderId: lm.senderId } : null,
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

    const messages = await Message.find({
      groupId: null,
      deletedFor: { $ne: myId },
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("replyTo", "text image file senderId");

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
      data: { url: "/", chatType: "direct", chatId: senderId.toString() },
    });

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
    const messages = await Message.find({ starredBy: myId })
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
