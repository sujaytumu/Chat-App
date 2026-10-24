import mongoose from "mongoose";
import Reel from "../models/reel.model.js";
import StatusComment from "../models/statusComment.model.js";
import cloudinary from "../lib/cloudinary.js";
import { visibleUserIds, canSee } from "../lib/visibility.js";
import { MAX_BASE64_LENGTH } from "../lib/uploadFile.js";
import { sendPushToUser } from "../lib/webPush.js";

const FILTERS = ["none", "warm", "cool", "mono", "vivid", "fade", "vintage", "dream"];
const MAX_SONG_BASE64 = 6 * 1024 * 1024;

const MAX_SECONDS = 60;
const PAGE = 8;

const shape = (r, meId, commentCounts) => ({
  _id: r._id,
  videoUrl: r.videoUrl,
  poster: r.poster,
  caption: r.caption,
  duration: r.duration,
  filter: r.filter || "none",
  trim: r.trim?.end > 0 ? { start: r.trim.start || 0, end: r.trim.end } : null,
  song: r.song?.url ? { url: r.song.url, name: r.song.name, start: r.song.start || 0 } : null,
  createdAt: r.createdAt,
  user: r.userId?._id ? { _id: r.userId._id, fullName: r.userId.fullName, profilePic: r.userId.profilePic } : null,
  likeCount: (r.likes || []).length,
  liked: (r.likes || []).some((l) => String(l) === String(meId)),
  views: r.views || 0,
  comments: commentCounts?.get(String(r._id)) || 0,
  mine: String(r.userId?._id || r.userId) === String(meId),
});

const withCounts = async (rows, meId) => {
  const counts = new Map();
  if (rows.length) {
    const agg = await StatusComment.aggregate([
      { $match: { targetId: { $in: rows.map((r) => r._id) } } },
      { $group: { _id: "$targetId", n: { $sum: 1 } } },
    ]);
    for (const a of agg) counts.set(String(a._id), a.n);
  }
  return rows.filter((r) => r.userId).map((r) => shape(r, meId, counts));
};

// Reels from me + everyone I may see, newest first. ?before=<ISO date> pages further back.
export const getReelFeed = async (req, res) => {
  try {
    const me = req.user;
    const ids = await visibleUserIds(me);
    const q = ids === null ? {} : { userId: { $in: [me._id, ...[...ids].map((i) => new mongoose.Types.ObjectId(i))] } };
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && !Number.isNaN(before.getTime())) q.createdAt = { $lt: before };
    const blocked = (me.blockedUsers || []).map(String);
    const rows = await Reel.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).populate("userId", "fullName profilePic").lean();
    const more = rows.length > PAGE;
    const page = rows.slice(0, PAGE).filter((r) => !blocked.includes(String(r.userId?._id)));
    res.set("Cache-Control", "no-store");
    res.status(200).json({ reels: await withCounts(page, me._id), more });
  } catch (error) {
    console.log("Error in getReelFeed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getReel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const r = await Reel.findById(req.params.id).populate("userId", "fullName profilePic").lean();
    if (!r || !(await canSee(req.user, r.userId?._id))) return res.status(404).json({ error: "This reel isn't available" });
    res.status(200).json((await withCounts([r], req.user._id))[0]);
  } catch (error) {
    console.log("Error in getReel:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createReel = async (req, res) => {
  try {
    const { video, caption, duration, filter, trim, song } = req.body || {};
    const secs = Number(duration) || 0;
    if (typeof video !== "string" || !video.startsWith("data:video/")) return res.status(400).json({ error: "Pick a video" });
    if (video.length > MAX_BASE64_LENGTH) return res.status(413).json({ error: "That video is too large (max about 10 MB)" });
    if (secs > MAX_SECONDS + 0.5) return res.status(400).json({ error: `Reels can be at most ${MAX_SECONDS} seconds` });
    const up = await cloudinary.uploader.upload(video, { folder: "chat-app/reels", resource_type: "video" });
    if (up.duration && up.duration > MAX_SECONDS + 1) {
      cloudinary.uploader.destroy(up.public_id, { resource_type: "video" }).catch(() => {});
      return res.status(400).json({ error: `Reels can be at most ${MAX_SECONDS} seconds` });
    }
    // optional extras: a look, a trimmed part, a song
    const cleanFilter = FILTERS.includes(filter) ? filter : "none";
    let cleanTrim = { start: 0, end: 0 };
    const tStart = Number(trim?.start);
    const tEnd = Number(trim?.end);
    const total = up.duration || secs || 0;
    if (Number.isFinite(tStart) && Number.isFinite(tEnd) && tStart >= 0 && tEnd > tStart + 0.5 && (!total || tEnd <= total + 0.5)) {
      cleanTrim = { start: Math.round(tStart * 10) / 10, end: Math.round(tEnd * 10) / 10 };
    }
    let cleanSong;
    if (song?.data && typeof song.data === "string" && song.data.startsWith("data:audio/")) {
      if (song.data.length > MAX_SONG_BASE64) return res.status(413).json({ error: "That song is too large" });
      const sUp = await cloudinary.uploader.upload(song.data, { folder: "chat-app/reel-music", resource_type: "video" });
      const sStart = Number(song.start);
      cleanSong = { url: sUp.secure_url, name: String(song.name || "Song").slice(0, 80), start: Number.isFinite(sStart) ? Math.min(Math.max(sStart, 0), 3600) : 0 };
    }
    const reel = await Reel.create({
      filter: cleanFilter,
      trim: cleanTrim,
      ...(cleanSong ? { song: cleanSong } : {}),
      userId: req.user._id,
      videoUrl: up.secure_url,
      poster: up.secure_url.replace(/\.[a-z0-9]+$/i, ".jpg"), // Cloudinary makes a still of the first frame
      caption: typeof caption === "string" ? caption.trim().slice(0, 300) : "",
      duration: Math.round((cleanTrim.end > 0 ? cleanTrim.end - cleanTrim.start : up.duration || secs) * 10) / 10,
    });
    await reel.populate("userId", "fullName profilePic");
    res.status(201).json((await withCounts([reel.toObject()], req.user._id))[0]);
  } catch (error) {
    console.log("Error in createReel:", error.message);
    res.status(500).json({ error: "Couldn't post the reel" });
  }
};

export const likeReel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const r = await Reel.findById(req.params.id).select("userId likes").lean();
    if (!r || !(await canSee(req.user, r.userId))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.liked !== false;
    const already = (r.likes || []).some((l) => String(l) === String(req.user._id));
    const upd = await Reel.findByIdAndUpdate(req.params.id, want ? { $addToSet: { likes: req.user._id } } : { $pull: { likes: req.user._id } }, { new: true }).select("likes");
    if (want && !already && String(r.userId) !== String(req.user._id)) {
      sendPushToUser(r.userId, {
        title: "Talkies",
        body: `❤️ ${req.user.fullName} liked your reel`,
        icon: req.user.profilePic || "/icon-v2-192.png",
        tag: `reel-like-${req.params.id}`,
        data: { url: `/reels?r=${req.params.id}` },
      }).catch(() => {});
    }
    res.status(200).json({ liked: want, likeCount: upd.likes.length });
  } catch (error) {
    console.log("Error in likeReel:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const viewReel = async (req, res) => {
  try {
    if (mongoose.isValidObjectId(req.params.id)) await Reel.updateOne({ _id: req.params.id, userId: { $ne: req.user._id } }, { $inc: { views: 1 } });
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: false });
  }
};

export const deleteReel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const r = await Reel.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!r) return res.status(404).json({ error: "Not found" });
    StatusComment.deleteMany({ targetId: r._id }).catch(() => {});
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in deleteReel:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
