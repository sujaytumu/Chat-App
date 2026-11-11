import crypto from "crypto";
import Group from "../models/group.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";

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
    const group = await Group.findOne({ inviteCode: req.params.code }).select("name groupPic members approveJoins +joinRequests");
    if (!group) return res.status(404).json({ error: "This invite link is no longer valid" });
    res.status(200).json({
      _id: group._id,
      name: group.name,
      groupPic: group.groupPic,
      memberCount: group.members.length,
      alreadyMember: group.members.some((m) => m.equals(req.user._id)),
      needsApproval: group.approveJoins === true,
      requested: (group.joinRequests || []).some((r) => r.user.equals(req.user._id)),
    });
  } catch (error) {
    console.log("Error in previewInvite controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const joinByInvite = async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code }).select("+joinRequests");
    if (!group) return res.status(404).json({ error: "This invite link is no longer valid" });
    const myId = req.user._id;
    if (!group.members.some((m) => m.equals(myId))) {
      if (group.members.length >= MAX_MEMBERS) return res.status(400).json({ error: "This group is full" });
      if (group.approveJoins) {
        // An admin has to let them in: keep the request (once) and tell the admins.
        if (!group.joinRequests.some((r) => r.user.equals(myId))) {
          if (group.joinRequests.length >= 200) return res.status(400).json({ error: "Too many people are waiting to join. Try again later." });
          group.joinRequests.push({ user: myId });
          await group.save();
          for (const a of group.admins) {
            const sid = getReceiverSocketId(String(a));
            if (sid) io.to(sid).emit("groupJoinRequest", { groupId: String(group._id) });
            sendPushToUser(a, {
              title: group.name,
              body: `${req.user.fullName} wants to join the group`,
              icon: req.user.profilePic || "/icon-v2-192.png",
              tag: `join-${group._id}`,
              data: { url: "/", chatType: "group", chatId: String(group._id) },
            });
          }
        }
        return res.status(202).json({ pending: true, name: group.name });
      }
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

// ---- join approval (admins) ----
const adminGroup = async (req, res) => {
  const group = await Group.findById(req.params.id).select("+joinRequests");
  if (!group) return void res.status(404).json({ error: "Group not found" });
  if (!isAdmin(group, req.user._id)) return void res.status(403).json({ error: "Only admins can do this" });
  return group;
};

export const setApproveJoins = async (req, res) => {
  try {
    const group = await adminGroup(req, res);
    if (!group) return;
    group.approveJoins = req.body?.on === true;
    await group.save();
    io.to(group._id.toString()).emit("groupUpdated", await Group.findById(group._id).populate("members", MEMBER_FIELDS));
    res.status(200).json({ approveJoins: group.approveJoins });
  } catch (error) {
    console.log("Error in setApproveJoins:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listJoinRequests = async (req, res) => {
  try {
    const group = await adminGroup(req, res);
    if (!group) return;
    const g = await Group.findById(group._id).select("+joinRequests").populate("joinRequests.user", "fullName profilePic");
    const live = new Set(group.members.map(String));
    res.set("Cache-Control", "no-store");
    res.status(200).json(
      (g.joinRequests || []).filter((r) => r.user && !live.has(String(r.user._id))).map((r) => ({ _id: r.user._id, fullName: r.user.fullName, profilePic: r.user.profilePic || "", at: r.at }))
    );
  } catch (error) {
    console.log("Error in listJoinRequests:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const answerJoinRequest = async (req, res) => {
  try {
    const group = await adminGroup(req, res);
    if (!group) return;
    const uid = req.params.userId;
    const asked = group.joinRequests.some((r) => String(r.user) === uid);
    if (!asked) return res.status(404).json({ error: "That request is gone" });
    group.joinRequests = group.joinRequests.filter((r) => String(r.user) !== uid);
    const approve = req.body?.approve === true;
    if (approve && !group.members.some((m) => String(m) === uid)) {
      if (group.members.length >= MAX_MEMBERS) return res.status(400).json({ error: "This group is full" });
      group.members.push(uid);
    }
    await group.save();
    if (approve) {
      const populated = await Group.findById(group._id).populate("members", MEMBER_FIELDS);
      const sid = getReceiverSocketId(uid);
      if (sid) {
        io.sockets.sockets.get(sid)?.join(group._id.toString());
        io.to(sid).emit("groupCreated", populated);
      }
      io.to(group._id.toString()).emit("groupUpdated", populated);
      sendPushToUser(uid, {
        title: group.name,
        body: "An admin approved your request. You're in the group.",
        icon: group.groupPic || "/icon-v2-192.png",
        tag: `join-ok-${group._id}`,
        data: { url: "/", chatType: "group", chatId: String(group._id) },
      });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in answerJoinRequest:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
