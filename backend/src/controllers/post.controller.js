import mongoose from "mongoose";
import Post from "../models/post.model.js";
import StatusComment from "../models/statusComment.model.js";
import cloudinary from "../lib/cloudinary.js";
import { visibleUserIds, canSee } from "../lib/visibility.js";
import { sendPushToUser } from "../lib/webPush.js";
import { logActivity } from "../lib/activity.js";

const PAGE = 16;
const MAX_IMG = 13 * 1024 * 1024;

const shape = (p, me, comments = 0) => ({
  comments,
  _id: p._id,
  user: p.userId && { _id: p.userId._id, fullName: p.userId.fullName, profilePic: p.userId.profilePic },
  image: p.image,
  images: p.images?.length ? p.images : [p.image],
  caption: p.caption,
  createdAt: p.createdAt,
  likeCount: (p.likes || []).length,
  liked: (p.likes || []).some((l) => String(l) === String(me)),
  mine: String(p.userId?._id) === String(me),
});

// Newest first, 16 at a time. `before` = createdAt of the last post received.
export const getFeed = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const me = req.user;
    const ids = await visibleUserIds(me);
    const q = {};
    if (ids !== null) q.userId = { $in: [me._id, ...[...ids].map((i) => new mongoose.Types.ObjectId(i))] };
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && !isNaN(before)) q.createdAt = { $lt: before };
    const blocked = new Set((me.blockedUsers || []).map(String));
    const rows = await Post.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).populate("userId", "fullName profilePic").lean();
    const more = rows.length > PAGE;
    const page = rows.slice(0, PAGE).filter((p) => p.userId && !blocked.has(String(p.userId._id)));
    const agg = await StatusComment.aggregate([{ $match: { targetId: { $in: page.map((p) => p._id) } } }, { $group: { _id: "$targetId", n: { $sum: 1 } } }]);
    const cm = new Map(agg.map((a) => [String(a._id), a.n]));
    const posts = page.map((p) => shape(p, me._id, cm.get(String(p._id)) || 0));
    res.json({ posts, more, next: rows.length ? rows[Math.min(rows.length, PAGE) - 1].createdAt : null });
  } catch (e) {
    console.log("getFeed:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createPost = async (req, res) => {
  try {
    const { image, images, caption } = req.body || {};
    const list = Array.isArray(images) && images.length ? images : [image];
    if (!list.every((s) => typeof s === "string" && s.startsWith("data:image/"))) return res.status(400).json({ error: "Pick a photo" });
    if (list.length > 10) return res.status(400).json({ error: "Up to 10 photos per post" });
    if (list.some((s) => s.length > MAX_IMG) || list.reduce((n, s) => n + s.length, 0) > 16 * 1024 * 1024) return res.status(413).json({ error: "Those photos are too large" });
    const urls = [];
    for (const s of list) urls.push((await cloudinary.uploader.upload(s, { folder: "chat-app/posts", resource_type: "image" })).secure_url);
    const post = await Post.create({ userId: req.user._id, image: urls[0], images: urls, caption: String(caption || "").trim().slice(0, 500) });
    await post.populate("userId", "fullName profilePic");
    res.status(201).json(shape(post.toObject(), req.user._id));
  } catch (e) {
    console.log("createPost:", e.message);
    res.status(500).json({ error: "Couldn't post" });
  }
};

export const likePost = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const post = await Post.findById(req.params.id).select("userId likes image");
    if (!post || (!post.userId.equals(req.user._id) && !(await canSee(req.user, post.userId)))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.liked !== false;
    if (want) {
      const r = await Post.updateOne({ _id: post._id, likes: { $ne: req.user._id } }, { $push: { likes: req.user._id } });
      if (r.modifiedCount && !post.userId.equals(req.user._id)) {
        sendPushToUser(String(post.userId), { title: "Talkies", body: `❤️ ${req.user.fullName} liked your post`, icon: req.user.profilePic || "/icon-v2-192.png", tag: `post-like-${post._id}`, data: { url: "/reels?feed=1" } });
        logActivity({ to: post.userId, actor: req.user, type: "like", kind: "post", targetId: post._id, thumb: post.image });
      }
    } else await Post.updateOne({ _id: post._id }, { $pull: { likes: req.user._id } });
    const fresh = await Post.findById(post._id).select("likes").lean();
    res.json({ liked: want, likeCount: fresh.likes.length });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ error: "Not found" });
    for (const url of post.images?.length ? post.images : [post.image]) {
      const m = url.match(/\/upload\/(?:v\d+\/)?(chat-app\/posts\/[^.]+)/);
      if (m) cloudinary.uploader.destroy(m[1]).catch(() => {});
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};
