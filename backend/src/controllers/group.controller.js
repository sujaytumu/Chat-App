import Report from "../models/report.model.js";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { uploadFileAttachment, MAX_BASE64_LENGTH } from "../lib/uploadFile.js";
import { sendPushToUsers } from "../lib/webPush.js";
import { sanitizePoll } from "../lib/poll.js";
import { markGroupSeen } from "../lib/groupReceipts.js";

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
    if (removeGroupPic === true) {
      group.groupPic = "";
    } else if (groupPic) {
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

    const populatedGroup = await Group.findById(group._id).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");

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
    const groups = await Group.find({ members: myId }).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled").lean();
    const groupIds = groups.map((g) => g._id);

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate([
        { $match: { groupId: { $in: groupIds }, deletedFor: { $ne: myId } } },
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
        { $match: { groupId: { $in: groupIds }, senderId: { $ne: myId }, seenBy: { $ne: myId }, deletedFor: { $ne: myId } } },
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

    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const query = {
      groupId,
      deletedFor: { $ne: myId },
      // expired messages can linger a minute before MongoDB removes them
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
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

    // Mark unseen messages as seen by me
    await markGroupSeen(io, groupId, myId);

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getGroupMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { text, image, file, replyTo, mentions } = req.body;
    const poll = sanitizePoll(req.body.poll);
    const { id: groupId } = req.params;
    const senderId = req.user._id;

    if (!text?.trim() && !image && !file && !poll) {
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
    if (group.permissions?.sendMessages === "admins" && !group.admins.some((a) => a.equals(senderId))) {
      return res.status(403).json({ error: "Only admins can send messages in this group" });
    }

    // @mentions: only real members of this group, at most 20
    const mentionIds = [
      ...new Set(
        (Array.isArray(mentions) ? mentions : [])
          .map(String)
          .filter((id) => group.members.some((m) => m.toString() === id) && id !== String(senderId))
      ),
    ].slice(0, 20);

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

    // Members who are online right now receive it instantly -> already "delivered"
    const now = new Date();
    const deliveredTo = group.members
      .filter((m) => !m.equals(senderId) && getReceiverSocketId(m.toString()))
      .map((m) => ({ user: m, at: now }));

    let newMessage = await Message.create({
      senderId,
      groupId,
      deliveredTo,
      text: poll ? `📊 ${poll.question}` : text?.trim() || "",
      poll: poll || undefined,
      image: imageUrl,
      file: fileAttachment,
      replyTo: replyTo || null,
      mentions: mentionIds.length ? mentionIds : undefined,
      seenBy: [senderId],
      expiresAt: group.disappearAfter > 0 ? new Date(Date.now() + group.disappearAfter * 1000) : null,
    });
    newMessage = await newMessage.populate("replyTo", "text image file senderId");

    io.to(groupId.toString()).emit("newGroupMessage", newMessage);

    // Push to every other member (one DB query for all of them) so they're
    // notified even with the app closed
    // People tagged with @ are told even if they muted the group (like WhatsApp).
    const mentioned = new Set(mentionIds);
    if (mentioned.size) {
      sendPushToUsers(
        group.members.filter((m) => mentioned.has(m.toString())),
        {
          title: `${req.user.fullName} mentioned you in ${group.name}`,
          body: fileAttachment ? `📎 ${fileAttachment.name}` : imageUrl ? "📷 Photo" : newMessage.text,
          icon: group.groupPic || "/icon-v2-192.png",
          tag: `group-${groupId}`,
          data: { url: "/", chatType: "group", chatId: groupId.toString(), messageId: newMessage._id.toString() },
        },
        {}
      );
    }
    sendPushToUsers(
      group.members.filter((memberId) => !memberId.equals(senderId) && !mentioned.has(memberId.toString())),
      {
        title: `${req.user.fullName} in ${group.name}`,
        body: fileAttachment ? `📎 ${fileAttachment.name}` : imageUrl ? "📷 Photo" : newMessage.text,
        icon: group.groupPic || "/icon-v2-192.png",
        tag: `group-${groupId}`,
        data: {
          url: "/",
          chatType: "group",
          chatId: groupId.toString(),
          messageId: newMessage._id.toString(),
        },
      },
      {},
      `g:${groupId}`
    );

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
    if (!group.admins.some((a) => a.equals(myId)) && !(group.permissions?.addMembers === "all" && group.members.some((m) => m.equals(myId)))) {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    const newMembers = memberIds.filter((id) => !group.members.some((m) => m.equals(id)));
    group.members.push(...newMembers);
    await group.save();

    const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");

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

    const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");
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
      const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");
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

// Admins choose who can edit the group info / add members / send messages.
export const updateGroupPermissions = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const myId = req.user._id;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(myId))) {
      return res.status(403).json({ error: "Only admins can change group permissions" });
    }
    for (const key of ["editInfo", "addMembers", "sendMessages"]) {
      const v = req.body?.[key];
      if (v === "admins" || v === "all") group.set(`permissions.${key}`, v);
    }
    await group.save();
    const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);
    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in updateGroupPermissions controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reportGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const myId = req.user._id;
    const group = await Group.findById(groupId).select("members");
    if (!group || !group.members.some((m) => m.equals(myId))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }
    const reasons = ["spam", "abuse", "inappropriate", "scam", "other"];
    const reason = reasons.includes(req.body?.reason) ? req.body.reason : "other";
    const details = String(req.body?.details || "").slice(0, 500);
    await Report.findOneAndUpdate(
      { reporterId: myId, groupId },
      { reason, details },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in reportGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const DISAPPEAR_OPTIONS = [0, 24 * 3600, 7 * 24 * 3600, 90 * 24 * 3600];

// Admins turn disappearing messages on/off (applies to messages sent from now on).
export const setDisappearing = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const seconds = Number(req.body?.seconds);
    if (!DISAPPEAR_OPTIONS.includes(seconds)) return res.status(400).json({ error: "Invalid duration" });
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(req.user._id))) {
      return res.status(403).json({ error: "Only admins can change disappearing messages" });
    }
    group.disappearAfter = seconds;
    await group.save();
    const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);
    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in setDisappearing controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateGroupInfo = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { name, groupPic, removeGroupPic } = req.body;
    const myId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.admins.some((a) => a.equals(myId)) && !(group.permissions?.editInfo === "all" && group.members.some((m) => m.equals(myId)))) {
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

    const populatedGroup = await Group.findById(groupId).populate("members", "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled");
    io.to(groupId.toString()).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.log("Error in updateGroupInfo controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
