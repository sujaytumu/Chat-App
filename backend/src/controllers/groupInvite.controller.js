import crypto from "crypto";
import Group from "../models/group.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

const MEMBER_FIELDS =
  "-password -pushSubscriptions -archivedChats -pinnedChats -mutedChats -chatLists -privacy -blockedUsers -twoFactor.enabled";
const MAX_MEMBERS = 1024;
const newCode = () => crypto.randomBytes(9).toString("base64url");
const isAdmin = (g, id) => g.admins.some((a) => a.equals(id));

// Admins read (creating on first use) or reset the group's invite code.
export const getInvite = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).select("+inviteCode");
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!isAdmin(group, req.user._id)) return res.status(403).json({ error: "Only admins can share the invite link" });
    if (!group.inviteCode || req.body?.reset) {
      group.inviteCode = newCode();
      await group.save();
    }
    res.status(200).json({ code: group.inviteCode });
  } catch (error) {
    console.log("Error in getInvite controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// What the "Join group?" screen shows (name, picture, how many people).
export const previewInvite = async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code }).select("name groupPic members");
    if (!group) return res.status(404).json({ error: "This invite link is no longer valid" });
    res.status(200).json({
      _id: group._id,
      name: group.name,
      groupPic: group.groupPic,
      memberCount: group.members.length,
      alreadyMember: group.members.some((m) => m.equals(req.user._id)),
    });
  } catch (error) {
    console.log("Error in previewInvite controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const joinByInvite = async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code });
    if (!group) return res.status(404).json({ error: "This invite link is no longer valid" });
    const myId = req.user._id;
    if (!group.members.some((m) => m.equals(myId))) {
      if (group.members.length >= MAX_MEMBERS) return res.status(400).json({ error: "This group is full" });
      group.members.push(myId);
      await group.save();
    }
    const populated = await Group.findById(group._id).populate("members", MEMBER_FIELDS);
    const socketId = getReceiverSocketId(String(myId));
    if (socketId) {
      io.sockets.sockets.get(socketId)?.join(group._id.toString());
      io.to(socketId).emit("groupCreated", populated);
    }
    io.to(group._id.toString()).emit("groupUpdated", populated);
    res.status(200).json(populated);
  } catch (error) {
    console.log("Error in joinByInvite controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
