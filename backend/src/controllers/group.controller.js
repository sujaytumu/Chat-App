import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { uploadFileAttachment, MAX_BASE64_LENGTH } from "../lib/uploadFile.js";
import { sendPushToUser } from "../lib/webPush.js";

const MAX_IMAGE_BASE64_LENGTH = 6.5 * 1024 * 1024;

// Create a group with the creator as the first admin + member
export const createGroup = async (req, res) => {
  try {
    const { name, memberIds, groupPic } = req.body;
    const myId = req.user._id;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }
    if (!Array.isArray(memberIds) || memberIds.length < 1) {
      return res.status(400).json({ error: "Select at least one other member" });
    }

    let groupPicUrl = "";
    if (groupPic) {
      const uploadResponse = await cloudinary.uploader.upload(groupPic, {
        folder: "chat-app/groups",
      });
      groupPicUrl = uploadResponse.secure_url;
    }

    const uniqueMembers = Array.from(new Set([...memberIds, myId.toString()]));

    const group = await Group.create({
      name: name.trim(),
      groupPic: groupPicUrl,
      members: uniqueMembers,
      admins: [myId],
      createdBy: myId,
    });

    const populatedGroup = await Group.findById(group._id).populate("members", "-password");

    // Notify every member in real time so the group shows up instantly
    uniqueMembers.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId);
      if (socketId) {
        io.sockets.sockets.get(socketId)?.join(group._id.toString());
        io.to(socketId).emit("groupCreated", populatedGroup);
      }
    });

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.log("Error in createGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// All groups the logged-in user belongs to, with last message + unread count.
// Two aggregations cover every group in one round trip each, instead of
// two queries per group.
export const getUserGroups = async (req, res) => {
  try {
    const myId = req.user._id;
    const groups = await Group.find({ members: myId }).populate("members", "-password").lean();
    const groupIds = groups.map((g) => g._id);

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate([
        { $match: { groupId: { $in: groupIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$groupId",
            text: { $first: "$text" },
            image: { $first: "$image" },
            file: { $first: "$file" },
            createdAt: { $first: "$createdAt" },
            senderId: { $first: "$senderId" },
          },
        },
      ]),
      Message.aggregate([
        { $match: { groupId: { $in: groupIds }, senderId: { $ne: myId }, seenBy: { $ne: myId } } },
        { $group: { _id: "$groupId", count: { $sum: 1 } } },
      ]),
    ]);

    const lastMessageByGroup = new Map(lastMessages.map((m) => [m._id.toString(), m]));
    const unreadByGroup = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

    const groupsWithMeta = groups.map((group) => {
      const lm = lastMessageByGroup.get(group._id.toString());
      return {
        ...group,
        lastMessage: lm ? { text: lm.text, image: lm.image, file: lm.file, createdAt: lm.createdAt, senderId: lm.senderId } : null,
        unreadCount: unreadByGroup.get(group._id.toString()) || 0,
      };
    });

    groupsWithMeta.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    res.status(200).json(groupsWithMeta);
  } catch (error) {
    console.log("Error in getUserGroups controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group || !group.members.some((m) => m.equals(myId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    const messages = await Message.find({ groupId, deletedFor: { $ne: myId } })
      .sort({ createdAt: 1 })
      .populate("replyTo", "text image file senderId");

    // Mark unseen messages as seen by me
    await Message.updateMany(
      { groupId, senderId: { $ne: myId }, seenBy: { $ne: myId } },
      { $addToSet: { seenBy: myId } }
    );

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getGroupMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { text, image, file, replyTo } = req.body;
    const { id: groupId } = req.params;
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

    const group = await Group.findById(groupId);
    if (!group || !group.members.some((m) => m.equals(senderId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
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

    let newMessage = await Message.create({
      senderId,
      groupId,
      text: text?.trim() || "",
      image: imageUrl,
      file: fileAttachment,
      replyTo: replyTo || null,
      seenBy: [senderId],
    });
    newMessage = await newMessage.populate("replyTo", "text image file senderId");

    io.to(groupId.toString()).emit("newGroupMessage", newMessage);

    // Push to every other member so they're notified even with the app closed
    group.members
      .filter((memberId) => !memberId.equals(senderId))
      .forEach((memberId) => {
        sendPushToUser(memberId, {
          title: `${req.user.fullName} in ${group.name}`,
          body: fileAttachment ? `📎 ${fileAttachment.name}` : imageUrl ? "📷 Photo" : newMessage.text,
          icon: group.groupPic || "/icon-v2-192.png",
          tag: `group-${groupId}`,
          data: { url: "/", chatType: "group", chatId: groupId.toString() },
        });
      });

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendGroupMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addMembers = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { memberIds } = req.body;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(myId))) {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    const newMembers = memberIds.filter((id) => !group.members.some((m) => m.equals(id)));
    group.members.push(...newMembers);
    await group.save();

    const populatedGroup = await Group.findById(groupId).populate("members", "-password");

    newMembers.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId);
      if (socketId) {
        io.sockets.sockets.get(socketId)?.join(groupId.toString());
        io.to(socketId).emit("groupCreated", populatedGroup);
      }
    });
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in addMembers controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { id: groupId, memberId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(myId))) {
      return res.status(403).json({ error: "Only admins can remove members" });
    }

    group.members = group.members.filter((m) => !m.equals(memberId));
    group.admins = group.admins.filter((a) => !a.equals(memberId));
    await group.save();

    const populatedGroup = await Group.findById(groupId).populate("members", "-password");
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);

    const removedSocketId = getReceiverSocketId(memberId);
    if (removedSocketId) {
      io.sockets.sockets.get(removedSocketId)?.leave(groupId.toString());
      io.to(removedSocketId).emit("removedFromGroup", { groupId });
    }

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in removeMember controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const leaveGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    group.members = group.members.filter((m) => !m.equals(myId));
    group.admins = group.admins.filter((a) => !a.equals(myId));

    // If no admins remain but members do, promote the longest-standing member
    if (group.admins.length === 0 && group.members.length > 0) {
      group.admins.push(group.members[0]);
    }

    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);
    } else {
      await group.save();
      const populatedGroup = await Group.findById(groupId).populate("members", "-password");
      io.to(groupId.toString()).emit("groupUpdated", populatedGroup);
    }

    const mySocketId = getReceiverSocketId(myId);
    if (mySocketId) {
      io.sockets.sockets.get(mySocketId)?.leave(groupId.toString());
    }

    res.status(200).json({ message: "Left group" });
  } catch (error) {
    console.log("Error in leaveGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateGroupInfo = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { name, groupPic } = req.body;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(myId))) {
      return res.status(403).json({ error: "Only admins can update group info" });
    }

    if (name?.trim()) group.name = name.trim();
    if (groupPic) {
      const uploadResponse = await cloudinary.uploader.upload(groupPic, {
        folder: "chat-app/groups",
      });
      group.groupPic = uploadResponse.secure_url;
    }
    await group.save();

    const populatedGroup = await Group.findById(groupId).populate("members", "-password");
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in updateGroupInfo controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
