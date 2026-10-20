import mongoose from "mongoose";
import Channel from "../models/channel.model.js";
import ChannelPost from "../models/channelPost.model.js";
import cloudinary from "../lib/cloudinary.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUsers } from "../lib/webPush.js";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX_IMG = 8 * 1024 * 1024; // base64 characters

const uploadImage = async (data, folder) => {
  if (typeof data !== "string" || !data.startsWith("data:image/") || data.length > MAX_IMG) throw Object.assign(new Error("bad image"), { status: 400, msg: "Pick a smaller image" });
  return (await cloudinary.uploader.upload(data, { folder })).secure_url;
};

const summary = (c, me, last) => ({
  _id: c._id,
  name: c.name,
  description: c.description,
  icon: c.icon,
  ownerId: c.ownerId,
  followerCount: c.followers.length,
  isOwner: String(c.ownerId) === String(me),
  isFollowing: c.followers.some((f) => String(f) === String(me)),
  lastPost: last ? { text: last.text || (last.image ? "📷 Photo" : ""), createdAt: last.createdAt } : null,
});

const lastPosts = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await ChannelPost.aggregate([
    { $match: { channelId: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$channelId", text: { $first: "$text" }, image: { $first: "$image" }, createdAt: { $first: "$createdAt" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const postView = (p, me) => {
  const counts = {};
  let mine = null;
  for (const r of p.reactions || []) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (String(r.userId) === String(me)) mine = r.emoji;
  }
  return { _id: p._id, channelId: p.channelId, text: p.text, image: p.image, createdAt: p.createdAt, reactions: counts, myReaction: mine };
};

const loadChannel = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: "Invalid channel" });
    return null;
  }
  const c = await Channel.findById(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Channel not found" });
    return null;
  }
  return c;
};
const fail = (res, e, where) => {
  if (e.status) return res.status(e.status).json({ error: e.msg || e.message });
  console.log(`Error in ${where}:`, e.message);
  res.status(500).json({ error: "Internal server error" });
};

// GET /channels?q=  -> { mine: channels I follow or own, discover: other channels (search with q) }
export const listChannels = async (req, res) => {
  try {
    const me = req.user._id;
    const q = String(req.query.q || "").trim().slice(0, 40);
    const [mine, discover] = await Promise.all([
      Channel.find({ $or: [{ followers: me }, { ownerId: me }] }).lean(),
      Channel.find({ followers: { $ne: me }, ownerId: { $ne: me }, ...(q ? { name: { $regex: esc(q), $options: "i" } } : {}) }).lean(),
    ]);
    discover.sort((a, b) => b.followers.length - a.followers.length);
    const top = discover.slice(0, 30);
    const last = await lastPosts([...mine, ...top].map((c) => c._id));
    const out = (c) => summary(c, me, last.get(String(c._id)));
    const mineOut = mine.map(out).sort((a, b) => new Date(b.lastPost?.createdAt || 0) - new Date(a.lastPost?.createdAt || 0));
    res.status(200).json({ mine: mineOut, discover: top.map(out) });
  } catch (e) {
    fail(res, e, "listChannels");
  }
};

export const createChannel = async (req, res) => {
  try {
    const me = req.user._id;
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim().slice(0, 300);
    if (name.length < 3 || name.length > 60) return res.status(400).json({ error: "Channel name must be 3-60 characters" });
    if ((await Channel.countDocuments({ ownerId: me })) >= 5) return res.status(400).json({ error: "You can own up to 5 channels" });
    const icon = req.body?.icon ? await uploadImage(req.body.icon, "chat-app/channels") : "";
    const c = await Channel.create({ name, description, icon, ownerId: me, followers: [] });
    res.status(201).json(summary(c.toObject(), me, null));
  } catch (e) {
    fail(res, e, "createChannel");
  }
};

export const updateChannel = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    if (String(c.ownerId) !== String(req.user._id)) return res.status(403).json({ error: "Only the owner can edit this channel" });
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 3 || name.length > 60) return res.status(400).json({ error: "Channel name must be 3-60 characters" });
      c.name = name;
    }
    if (req.body.description !== undefined) c.description = String(req.body.description).trim().slice(0, 300);
    if (req.body.icon) c.icon = await uploadImage(req.body.icon, "chat-app/channels");
    await c.save();
    res.status(200).json(summary(c.toObject(), req.user._id, null));
  } catch (e) {
    fail(res, e, "updateChannel");
  }
};

export const deleteChannel = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    if (String(c.ownerId) !== String(req.user._id)) return res.status(403).json({ error: "Only the owner can delete this channel" });
    await ChannelPost.deleteMany({ channelId: c._id });
    await c.deleteOne();
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e, "deleteChannel");
  }
};

// GET /channels/:id?before=<iso>  -> channel + a page of posts (newest first)
export const getChannel = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    const me = req.user._id;
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const filter = { channelId: c._id, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { $lt: before } } : {}) };
    const posts = await ChannelPost.find(filter).sort({ createdAt: -1 }).limit(30).lean();
    res.status(200).json({ channel: summary(c.toObject(), me, posts[0]), posts: posts.map((p) => postView(p, me)), more: posts.length === 30 });
  } catch (e) {
    fail(res, e, "getChannel");
  }
};

export const followChannel = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    await Channel.updateOne({ _id: c._id }, { $addToSet: { followers: req.user._id } });
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e, "followChannel");
  }
};

export const unfollowChannel = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    await Channel.updateOne({ _id: c._id }, { $pull: { followers: req.user._id } });
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e, "unfollowChannel");
  }
};

export const createPost = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    if (String(c.ownerId) !== String(req.user._id)) return res.status(403).json({ error: "Only the owner can post here" });
    const text = String(req.body?.text || "").trim().slice(0, 2000);
    if (!text && !req.body?.image) return res.status(400).json({ error: "Write something or add a photo" });
    const image = req.body?.image ? await uploadImage(req.body.image, "chat-app/channel-posts") : "";
    const post = await ChannelPost.create({ channelId: c._id, text, image });
    const view = postView(post.toObject(), req.user._id);
    const audience = [c.ownerId, ...c.followers];
    audience.forEach((uid) => {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("channelPost", { channel: { _id: c._id, name: c.name, icon: c.icon }, post: postView(post.toObject(), uid) });
    });
    if (c.followers.length) {
      sendPushToUsers(c.followers.slice(0, 500), { title: c.name, body: text.slice(0, 120) || "📷 Photo", icon: "/icon-v2-192.png", tag: `channel-${c._id}`, data: { url: "/channels" } });
    }
    res.status(201).json(view);
  } catch (e) {
    fail(res, e, "createPost");
  }
};

export const deletePost = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    if (String(c.ownerId) !== String(req.user._id)) return res.status(403).json({ error: "Only the owner can delete posts" });
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ error: "Invalid post" });
    await ChannelPost.deleteOne({ _id: req.params.postId, channelId: c._id });
    [c.ownerId, ...c.followers].forEach((uid) => {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("channelPostDeleted", { channelId: c._id, postId: req.params.postId });
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e, "deletePost");
  }
};

// PUT /channels/:id/posts/:postId/react { emoji }  (same emoji again removes it)
export const reactToPost = async (req, res) => {
  try {
    const c = await loadChannel(req, res);
    if (!c) return;
    const me = req.user._id;
    const emoji = String(req.body?.emoji || "");
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: "Unsupported reaction" });
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ error: "Invalid post" });
    const post = await ChannelPost.findOne({ _id: req.params.postId, channelId: c._id });
    if (!post) return res.status(404).json({ error: "Post not found" });
    const had = post.reactions.find((r) => String(r.userId) === String(me));
    post.reactions = post.reactions.filter((r) => String(r.userId) !== String(me));
    if (!had || had.emoji !== emoji) post.reactions.push({ userId: me, emoji });
    await post.save();
    res.status(200).json(postView(post.toObject(), me));
  } catch (e) {
    fail(res, e, "reactToPost");
  }
};
