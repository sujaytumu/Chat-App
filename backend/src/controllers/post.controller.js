import mongoose from "mongoose";
import Post from "../models/post.model.js";
import StatusComment from "../models/statusComment.model.js";
import cloudinary from "../lib/cloudinary.js";
import { visibleUserIds, canSee } from "../lib/visibility.js";
import { sendPushToUser } from "../lib/webPush.js";
import { logActivity } from "../lib/activity.js";

const PAGE = 16;
import { audienceAllows, audienceFilter, cleanAudience, defaultAudienceFor } from "../lib/audience.js";
const MAX_IMG = 13 * 1024 * 1024;
const MAX_SONG_BASE64 = 6 * 1024 * 1024;

const shape = (p, me, comments = 0) => ({
  comments,
  _id: p._id,
  user: p.userId && { _id: p.userId._id, fullName: p.userId.fullName, profilePic: p.userId.profilePic },
  image: p.image,
  images: p.images?.length ? p.images : [p.image],
  caption: p.caption,
  lines: p.lines || "",
  song: p.song?.url ? { url: p.song.url, name: p.song.name, start: p.song.start || 0 } : null,
  createdAt: p.createdAt,
  likeCount: (p.likes || []).length,
  liked: (p.likes || []).some((l) => String(l) === String(me)),
  mine: String(p.userId?._id) === String(me),
  saved: (p.saves || []).some((l) => String(l) === String(me)),
  ...(String(p.userId?._id) === String(me) ? { audience: { mode: p.audience?.mode || "all", users: (p.audience?.users || []).map(String) } } : {}),
});

// Newest first, 16 at a time. `before` = createdAt of the last post received.
export const getFeed = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const me = req.user;
    const ids = await visibleUserIds(me, "posts");
    const q = { $and: [audienceFilter(me._id)] };
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
    const { image, images, caption, lines, song } = req.body || {};
    const list = Array.isArray(images) && images.length ? images : [image];
    if (!list.every((s) => typeof s === "string" && s.startsWith("data:image/"))) return res.status(400).json({ error: "Pick a photo" });
    if (list.length > 10) return res.status(400).json({ error: "Up to 10 photos per post" });
    if (list.some((s) => s.length > MAX_IMG) || list.reduce((n, s) => n + s.length, 0) > 16 * 1024 * 1024) return res.status(413).json({ error: "Those photos are too large" });
    // up to 4 photos upload at the same time (10 one after another could run past the server's time limit); order is kept
    const urls = new Array(list.length);
    for (let i = 0; i < list.length; i += 4) {
      const part = list.slice(i, i + 4);
      const got = await Promise.all(part.map((s) => cloudinary.uploader.upload(s, { folder: "chat-app/posts", resource_type: "image", ...(/^data:image\/(jpe?g|png|webp|gif)[;,]/i.test(s) ? {} : { format: "jpg" }) })));
      got.forEach((r, k) => { urls[i + k] = r.secure_url; });
    }
    // who can see it: what the person picked for this post, else their default for posts
    const postAudience = cleanAudience(req.body?.audience, req.user._id) || (await defaultAudienceFor(req.user._id, "posts"));
    // optional song (picked in the composer) - kept with the post
    let cleanSong = null;
    if (song?.data && typeof song.data === "string" && song.data.startsWith("data:audio/")) {
      if (song.data.length > MAX_SONG_BASE64) return res.status(413).json({ error: "That song is too large" });
      const up = await cloudinary.uploader.upload(song.data, { folder: "chat-app/post-music", resource_type: "video" });
      const st = Number(song.start);
      cleanSong = { url: up.secure_url, name: String(song.name || "Song").slice(0, 80), start: Number.isFinite(st) ? Math.min(Math.max(st, 0), 3600) : 0 };
    }
    const post = await Post.create({
      userId: req.user._id,
      image: urls[0],
      images: urls,
      caption: String(caption || "").trim().slice(0, 500),
      lines: String(lines || "").trim().slice(0, 300),
      ...(postAudience ? { audience: postAudience } : {}),
      ...(cleanSong ? { song: cleanSong } : {}),
    });
    await post.populate("userId", "fullName profilePic");
    res.status(201).json(shape(post.toObject(), req.user._id));
  } catch (e) {
    console.log("createPost:", e.message);
    res.status(500).json({ error: "Couldn't post" });
  }
};

// Posts the person bookmarked (only ones they are still allowed to see), newest post first
export const getSaved = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const me = req.user;
    const ids = await visibleUserIds(me, "posts");
    const q = { saves: me._id, $and: [audienceFilter(me._id)] };
    if (ids !== null) q.userId = { $in: [me._id, ...[...ids].map((i) => new mongoose.Types.ObjectId(i))] };
    const blocked = new Set((me.blockedUsers || []).map(String));
    const rows = await Post.find(q).sort({ createdAt: -1 }).limit(60).populate("userId", "fullName profilePic").lean();
    const page = rows.filter((p) => p.userId && !blocked.has(String(p.userId._id)));
    const agg = await StatusComment.aggregate([{ $match: { targetId: { $in: page.map((p) => p._id) } } }, { $group: { _id: "$targetId", n: { $sum: 1 } } }]);
    const cm = new Map(agg.map((a) => [String(a._id), a.n]));
    res.json({ posts: page.map((p) => shape(p, me._id, cm.get(String(p._id)) || 0)), more: false, next: null });
  } catch (e) {
    console.log("getSaved:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// One post by id (for shared post links). Same rules as the feed: the owner, or someone the owner's audience and access rules allow.
export const getPost = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const me = req.user;
    const p = await Post.findById(req.params.id).populate("userId", "fullName profilePic").lean();
    if (!p || !p.userId) return res.status(404).json({ error: "Not found" });
    const mine = String(p.userId._id) === String(me._id);
    if (!mine) {
      const blocked = new Set((me.blockedUsers || []).map(String));
      if (blocked.has(String(p.userId._id)) || !audienceAllows(p.audience, me._id) || !(await canSee(me, p.userId._id, "posts"))) return res.status(404).json({ error: "Not found" });
    }
    const n = await StatusComment.countDocuments({ targetId: p._id });
    res.json(shape(p, me._id, n));
  } catch (e) {
    console.log("getPost:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Who liked a post - only the person who posted it can see the list (others only see the number)
export const getLikers = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id }).select("likes").populate({ path: "likes", select: "fullName profilePic", options: { limit: 200 } }).lean();
    if (!post) return res.status(404).json({ error: "Not found" });
    res.json({ users: (post.likes || []).map((u) => ({ _id: u._id, fullName: u.fullName, profilePic: u.profilePic })), total: (post.likes || []).length });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const savePost = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const post = await Post.findById(req.params.id).select("userId audience");
    if (!post || (!post.userId.equals(req.user._id) && (!audienceAllows(post.audience, req.user._id) || !(await canSee(req.user, post.userId, "posts"))))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.saved !== false;
    await Post.updateOne({ _id: post._id }, want ? { $addToSet: { saves: req.user._id } } : { $pull: { saves: req.user._id } });
    res.json({ saved: want });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const likePost = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const post = await Post.findById(req.params.id).select("userId likes image audience");
    if (!post || (!post.userId.equals(req.user._id) && (!audienceAllows(post.audience, req.user._id) || !(await canSee(req.user, post.userId, "posts"))))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.liked !== false;
    if (want) {
      const r = await Post.updateOne({ _id: post._id, likes: { $ne: req.user._id } }, { $push: { likes: req.user._id } });
      if (r.modifiedCount && !post.userId.equals(req.user._id)) {
        sendPushToUser(String(post.userId), { title: "Talkies", body: `❤️ ${req.user.fullName} liked your post`, icon: req.user.profilePic || "/icon-v2-192.png", tag: `post-like-${post._id}`, data: { url: "/post" } });
        logActivity({ to: post.userId, actor: req.user, type: "like", kind: "post", targetId: post._id, thumb: post.image });
      }
    } else await Post.updateOne({ _id: post._id }, { $pull: { likes: req.user._id } });
    const fresh = await Post.findById(post._id).select("likes").lean();
    res.json({ liked: want, likeCount: fresh.likes.length });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// The owner can change everything about a post after posting: caption, lines, song (add / change / remove) and who can see it
const songFilePath = (url) => (url || "").match(/\/upload\/(?:v\d+\/)?(chat-app\/post-music\/[^.]+)/)?.[1];
export const updatePost = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ error: "Not found" });
    const { caption, lines, song, removeSong, audience } = req.body || {};
    if (typeof caption === "string") post.caption = caption.trim().slice(0, 500);
    if (typeof lines === "string") post.lines = lines.trim().slice(0, 300);
    if (audience) {
      if (audience.mode === "only" && !(Array.isArray(audience.users) && audience.users.length)) return res.status(400).json({ error: "Pick at least one person" });
      const a = cleanAudience(audience, req.user._id);
      if (!a) return res.status(400).json({ error: "Bad audience" });
      post.audience = a;
    }
    const oldSong = post.song?.url;
    if (song?.data && typeof song.data === "string" && song.data.startsWith("data:audio/")) {
      if (song.data.length > MAX_SONG_BASE64) return res.status(413).json({ error: "That song is too large" });
      const up = await cloudinary.uploader.upload(song.data, { folder: "chat-app/post-music", resource_type: "video" });
      const st = Number(song.start);
      post.song = { url: up.secure_url, name: String(song.name || "Song").slice(0, 80), start: Number.isFinite(st) ? Math.min(Math.max(st, 0), 3600) : 0 };
    } else if (removeSong === true) {
      post.song = undefined;
    }
    await post.save();
    // the replaced / removed song file is no longer needed
    if (oldSong && oldSong !== post.song?.url) {
      const pid = songFilePath(oldSong);
      if (pid) cloudinary.uploader.destroy(pid, { resource_type: "video" }).catch(() => {});
    }
    res.json({
      caption: post.caption,
      lines: post.lines || "",
      song: post.song?.url ? { url: post.song.url, name: post.song.name, start: post.song.start || 0 } : null,
      audience: { mode: post.audience?.mode || "all", users: (post.audience?.users || []).map(String) },
    });
  } catch (e) {
    console.log("updatePost:", e.message);
    res.status(500).json({ error: "Couldn't save" });
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
    if (post.song?.url) {
      const sm = post.song.url.match(/\/upload\/(?:v\d+\/)?(chat-app\/post-music\/[^.]+)/);
      if (sm) cloudinary.uploader.destroy(sm[1], { resource_type: "video" }).catch(() => {});
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};
