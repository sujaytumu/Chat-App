import mongoose from "mongoose";
import Status from "../models/status.model.js";
import Highlight from "../models/highlight.model.js";
import StatusComment from "../models/statusComment.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";

const canSeeAudience = (a, viewerId) => {
  if (!a || !a.mode || a.mode === "all") return true;
  const listed = (a.users || []).some((u) => String(u) === String(viewerId));
  return a.mode === "only" ? listed : !listed;
};

// The status (still live) or highlight item the comment belongs to, if this person may see it.
// Returns { ownerId } or null.
const resolveTarget = async (targetId, viewerId) => {
  if (!mongoose.isValidObjectId(targetId)) return null;
  const st = await Status.findOne({ _id: targetId, expiresAt: { $gt: new Date() } }).select("userId audience").lean();
  if (st) {
    const own = String(st.userId) === String(viewerId);
    return own || canSeeAudience(st.audience, viewerId) ? { ownerId: String(st.userId) } : null;
  }
  const h = await Highlight.findOne({ "items._id": targetId }).select("userId items._id items.audience").lean();
  const item = h?.items?.find((i) => String(i._id) === String(targetId));
  if (!h || !item) return null;
  const own = String(h.userId) === String(viewerId);
  return own || canSeeAudience(item.audience, viewerId) ? { ownerId: String(h.userId) } : null;
};

const shape = (c, meId) => ({
  _id: c._id,
  targetId: c.targetId,
  parentId: c.parentId,
  text: c.text,
  createdAt: c.createdAt,
  user: c.userId && c.userId._id ? { _id: c.userId._id, fullName: c.userId.fullName, profilePic: c.userId.profilePic } : null,
  likeCount: (c.likes || []).length,
  liked: (c.likes || []).some((l) => String(l) === String(meId)),
});

// All comments under one status / highlight item, replies nested under their comment.
export const listComments = async (req, res) => {
  try {
    const { targetId } = req.params;
    const target = await resolveTarget(targetId, req.user._id);
    if (!target) return res.status(404).json({ error: "Not available" });
    const rows = await StatusComment.find({ targetId }).sort({ createdAt: 1 }).limit(500).populate("userId", "fullName profilePic").lean();
    const all = rows.filter((c) => c.userId).map((c) => shape(c, req.user._id));
    const tops = all.filter((c) => !c.parentId);
    const byParent = new Map();
    for (const c of all) if (c.parentId) byParent.set(String(c.parentId), [...(byParent.get(String(c.parentId)) || []), c]);
    const comments = tops.map((c) => ({ ...c, replies: byParent.get(String(c._id)) || [] }));
    res.set("Cache-Control", "no-store");
    res.status(200).json({ comments, total: all.length, ownerId: target.ownerId });
  } catch (error) {
    console.log("Error in listComments controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addComment = async (req, res) => {
  try {
    const { targetId } = req.params;
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 500) : "";
    if (!text) return res.status(400).json({ error: "Write a comment first" });
    const target = await resolveTarget(targetId, req.user._id);
    if (!target) return res.status(404).json({ error: "Not available" });

    // Instagram keeps one level: a reply to a reply attaches to the original comment.
    let parentId = null;
    let parentAuthor = null;
    if (req.body?.parentId) {
      if (!mongoose.isValidObjectId(req.body.parentId)) return res.status(400).json({ error: "Invalid comment" });
      const p = await StatusComment.findOne({ _id: req.body.parentId, targetId }).lean();
      if (!p) return res.status(404).json({ error: "That comment is gone" });
      parentId = p.parentId || p._id;
      parentAuthor = String(p.userId);
    }

    const c = await StatusComment.create({ targetId, ownerId: target.ownerId, userId: req.user._id, parentId, text });
    const out = shape({ ...c.toObject(), userId: { _id: req.user._id, fullName: req.user.fullName, profilePic: req.user.profilePic } }, req.user._id);

    // Tell the owner (and whoever was replied to) right away
    const who = new Set([target.ownerId, parentAuthor].filter(Boolean));
    who.delete(String(req.user._id));
    for (const uid of who) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("statusComment", { targetId, comment: out });
      sendPushToUser(uid, {
        title: "Talkies",
        body: `💬 ${req.user.fullName} ${uid === parentAuthor && uid !== target.ownerId ? "replied to your comment" : "commented"}: ${text.slice(0, 80)}`,
        icon: req.user.profilePic || "/icon-v2-192.png",
        tag: `status-comment-${targetId}`,
        data: { url: "/status" },
      });
    }
    res.status(201).json(out);
  } catch (error) {
    console.log("Error in addComment controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ error: "Not found" });
    const c = await StatusComment.findById(commentId).select("targetId");
    if (!c || !(await resolveTarget(c.targetId, req.user._id))) return res.status(404).json({ error: "Not found" });
    const liked = req.body?.liked !== false;
    await StatusComment.updateOne({ _id: commentId }, liked ? { $addToSet: { likes: req.user._id } } : { $pull: { likes: req.user._id } });
    res.status(200).json({ liked });
  } catch (error) {
    console.log("Error in likeComment controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// The author can delete their comment, and the owner of the status can delete any under it.
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ error: "Not found" });
    const c = await StatusComment.findById(commentId).select("userId ownerId");
    if (!c) return res.status(404).json({ error: "Not found" });
    const me = String(req.user._id);
    if (String(c.userId) !== me && String(c.ownerId) !== me) return res.status(403).json({ error: "You can't delete this comment" });
    await StatusComment.deleteMany({ $or: [{ _id: commentId }, { parentId: commentId }] }); // its replies go with it
    res.status(200).json({ message: "Deleted" });
  } catch (error) {
    console.log("Error in deleteComment controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
