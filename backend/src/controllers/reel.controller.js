import mongoose from "mongoose";
import Reel from "../models/reel.model.js";
import StatusComment from "../models/statusComment.model.js";
import Status from "../models/status.model.js";
import Follow from "../models/follow.model.js";
import SavedReel from "../models/savedReel.model.js";
import Repost from "../models/repost.model.js";
import { deliveryUrl } from "../lib/privateMedia.js";
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
  user: r.userId?._id ? { _id: r.userId._id, fullName: r.userId.fullName, profilePic: r.userId.profilePic } : r.externalId ? { _id: `ext-${r._id}`, fullName: r.externalAuthor || "Talkies Discover", profilePic: "" } : null,
  external: !!r.externalId,
  likeCount: (r.likes || []).length,
  liked: (r.likes || []).some((l) => String(l) === String(meId)),
  views: r.views || 0,
  comments: commentCounts?.get(String(r._id)) || 0,
  mine: String(r.userId?._id || r.userId) === String(meId),
  saves: r.saves || 0,
  reposts: r.reposts || 0,
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
  return rows.filter((r) => r.userId || r.externalId).map((r) => shape(r, meId, counts));
};

// ---- "Discover": popular vertical videos that appear on their own (needs PEXELS_API_KEY, free at pexels.com/api) ----
const discoverCache = new Map(); // page -> { at, items }
const discoverOn = () => !!process.env.PEXELS_API_KEY;
async function discoverPage(page) {
  const hit = discoverCache.get(page);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.items;
  try {
    const r = await fetch(`https://api.pexels.com/videos/popular?per_page=15&page=${page}&min_duration=5&max_duration=45`, {
      headers: { Authorization: process.env.PEXELS_API_KEY },
    });
    if (!r.ok) throw new Error(`pexels ${r.status}`);
    const j = await r.json();
    const items = (j.videos || [])
      .filter((v) => v.height > v.width)
      .map((v) => {
        const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && f.height > f.width).sort((x, y) => Math.abs(x.width - 720) - Math.abs(y.width - 720));
        const f = files[0];
        if (!f) return null;
        return {
          _id: `px-${v.id}`,
          source: "discover",
          videoUrl: f.link,
          poster: v.image || "",
          caption: "",
          duration: v.duration || 0,
          filter: "none",
          trim: null,
          song: null,
          createdAt: new Date().toISOString(),
          user: { _id: `px-u-${v.user?.id || v.id}`, fullName: v.user?.name || "Talkies Discover", profilePic: "" },
          likeCount: 0,
          liked: false,
          views: 0,
          comments: 0,
          saves: 0,
          mine: false,
          following: false,
          saved: false,
        };
      })
      .filter(Boolean);
    if (discoverCache.size > 40) discoverCache.clear();
    discoverCache.set(page, { at: Date.now(), items });
    return items;
  } catch (e) {
    console.log("Discover reels:", e.message);
    return [];
  }
}

const audienceAllows = (a, viewerId) => {
  if (!a || !a.mode || a.mode === "all") return true;
  const listed = (a.users || []).some((u) => String(u) === String(viewerId));
  return a.mode === "only" ? listed : !listed;
};

// The Reels feed: reels people posted + their video statuses (they appear on their own, nobody has to
// upload twice) + "Discover" clips. tab=friends shows only people I follow.
// ?before=<ISO date of the last local item> pages further back, ?px=<discover page>.
export const getReelFeed = async (req, res) => {
  try {
    const me = req.user;
    const myId = String(me._id);
    const friendsTab = req.query.tab === "friends";
    const ids = await visibleUserIds(me);
    const follows = new Set((await Follow.find({ follower: me._id }).select("following").lean()).map((f) => String(f.following)));
    const blocked = new Set((me.blockedUsers || []).map(String));

    let allowed = ids === null ? null : new Set([myId, ...[...ids].map(String)]);
    if (friendsTab) {
      const f = [...follows].filter((id) => !allowed || allowed.has(id));
      allowed = new Set(f);
    }
    const userQ = allowed === null ? {} : { userId: { $in: [...allowed].map((i) => new mongoose.Types.ObjectId(i)) } };
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const dateQ = before && !Number.isNaN(before.getTime()) ? { createdAt: { $lt: before } } : {};

    const [reelRows, statusRows, saved] = await Promise.all([
      Reel.find({ ...userQ, ...dateQ }).sort({ createdAt: -1 }).limit(PAGE + 1).populate("userId", "fullName profilePic").lean(),
      Promise.resolve([]), // video statuses are NOT shown as reels
      SavedReel.find({ userId: me._id }).select("key").lean(),
    ]);
    const savedKeys = new Set(saved.map((s) => s.key));
    const mineReposted = new Set((await Repost.find({ userId: me._id }).select("reelId").lean()).map((x) => String(x.reelId)));
    const statusIds = statusRows.map((s) => s._id);
    const counts = new Map();
    if (statusIds.length) {
      const agg = await StatusComment.aggregate([{ $match: { targetId: { $in: statusIds } } }, { $group: { _id: "$targetId", n: { $sum: 1 } } }]);
      for (const a of agg) counts.set(String(a._id), a.n);
    }
    const reelItems = (await withCounts(reelRows, me._id)).map((r) => ({ ...r, source: "reel", following: follows.has(String(r.user?._id)), saved: savedKeys.has(`reel:${r._id}`), reposted: mineReposted.has(String(r._id)) }));
    // reposts by people I may see: the original reel appears with "X reposted" at the time of the repost
    const repostRows = await Repost.find({ ...(allowed === null ? {} : { userId: { $in: [...allowed].filter((i) => i !== myId).map((i) => new mongoose.Types.ObjectId(i)) } }), ...dateQ })
      .sort({ createdAt: -1 })
      .limit(PAGE + 1)
      .populate("userId", "fullName profilePic")
      .populate({ path: "reelId", populate: { path: "userId", select: "fullName profilePic" } })
      .lean();
    const repostItems = [];
    const repostReels = repostRows.filter((x) => x.reelId && x.userId && (x.reelId.userId ? true : !!x.reelId.externalId));
    const shapedRe = await withCounts(repostReels.map((x) => x.reelId), me._id);
    const byId = new Map(shapedRe.map((r) => [String(r._id), r]));
    for (const x of repostReels) {
      const base = byId.get(String(x.reelId._id));
      if (!base) continue;
      if (x.reelId.userId && allowed && !allowed.has(String(x.reelId.userId._id || x.reelId.userId)) && String(x.reelId.userId._id || x.reelId.userId) !== myId) {
        if (!(await canSee(me, x.reelId.userId._id || x.reelId.userId))) continue;
      }
      repostItems.push({ ...base, source: "reel", createdAt: x.createdAt, repostedBy: { _id: x.userId._id, fullName: x.userId.fullName }, following: follows.has(String(base.user?._id)), saved: savedKeys.has(`reel:${base._id}`), reposted: mineReposted.has(String(base._id)) });
    }
    const statusItems = statusRows
      .filter((s) => s.userId && (String(s.userId._id) === myId || audienceAllows(s.audience, myId)))
      .map((s) => ({
        _id: s._id,
        source: "status",
        videoUrl: s.content,
        poster: "",
        caption: s.caption || "",
        duration: 0,
        filter: "none",
        trim: s.trim?.end > 0 ? { start: s.trim.start || 0, end: s.trim.end } : null,
        song: s.song?.url ? { url: s.song.url, name: s.song.name, start: s.song.start || 0 } : null,
        createdAt: s.createdAt,
        user: { _id: s.userId._id, fullName: s.userId.fullName, profilePic: s.userId.profilePic },
        likeCount: (s.likes || []).length,
        liked: (s.likes || []).some((l) => String(l.user) === myId),
        views: (s.views || []).length,
        comments: counts.get(String(s._id)) || 0,
        saves: 0,
        mine: String(s.userId._id) === myId,
        following: follows.has(String(s.userId._id)),
        saved: false,
      }));
    const seenIds = new Set();
    const merged = [...reelItems, ...repostItems, ...statusItems]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .filter((x) => (seenIds.has(String(x._id)) ? false : (seenIds.add(String(x._id)), true)))
      .filter((x) => x.user && !blocked.has(String(x.user._id))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const localMore = merged.length > PAGE || reelRows.length > PAGE || statusRows.length > PAGE || repostRows.length > PAGE;
    const page = merged.slice(0, PAGE);

    // Discover clips are woven in (every 3rd place) on the For-you tab, so the feed never runs dry.
    let px = Math.max(1, Math.min(parseInt(req.query.px, 10) || 1, 30));
    let out = page;
    let more = localMore;
    if (!friendsTab && discoverOn()) {
      const found = (await discoverPage(px)).slice(0, 4);
      px += 1;
      out = [];
      let d = 0;
      page.forEach((it, i) => {
        out.push(it);
        if ((i + 1) % 3 === 0 && found[d]) out.push({ ...found[d++], saved: savedKeys.has(`px:${found[d - 1]._id}`) });
      });
      while (d < found.length && out.length < PAGE + found.length) out.push({ ...found[d++] });
      more = px <= 30;
    }
    res.set("Cache-Control", "no-store");
    res.status(200).json({ reels: out, more, px, localMore, next: page.length ? page[page.length - 1].createdAt : null });
  } catch (error) {
    console.log("Error in getReelFeed:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const toggleFollow = async (req, res) => {
  try {
    const target = req.params.userId;
    if (!mongoose.isValidObjectId(target) || String(target) === String(req.user._id)) return res.status(400).json({ error: "Invalid" });
    if (!(await canSee(req.user, target))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.follow !== false;
    if (want) await Follow.updateOne({ follower: req.user._id, following: target }, { $setOnInsert: { follower: req.user._id, following: target } }, { upsert: true });
    else await Follow.deleteOne({ follower: req.user._id, following: target });
    res.status(200).json({ following: want });
  } catch (error) {
    console.log("Error in toggleFollow:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Bookmark / un-bookmark a reel (or a Discover clip, sent as a snapshot).
export const toggleSave = async (req, res) => {
  try {
    const { key, snapshot, saved } = req.body || {};
    if (typeof key !== "string" || !/^(reel:[a-f0-9]{24}|px:px-\d+|status:[a-f0-9]{24})$/.test(key)) return res.status(400).json({ error: "Invalid" });
    if (saved === false) {
      await SavedReel.deleteOne({ userId: req.user._id, key });
      if (key.startsWith("reel:")) await Reel.updateOne({ _id: key.slice(5), saves: { $gt: 0 } }, { $inc: { saves: -1 } });
      return res.status(200).json({ saved: false });
    }
    let snap = snapshot;
    if (key.startsWith("reel:")) {
      const r = await Reel.findById(key.slice(5)).populate("userId", "fullName profilePic").lean();
      if (!r || (r.userId && !(await canSee(req.user, r.userId._id)))) return res.status(404).json({ error: "Not found" });
      snap = (await withCounts([r], req.user._id))[0];
    } else if (key.startsWith("status:")) {
      const st = await Status.findOne({ _id: key.slice(7), type: "video", expiresAt: { $gt: new Date() } }).populate("userId", "fullName profilePic").lean();
      if (!st || !st.userId || (String(st.userId._id) !== String(req.user._id) && !audienceAllows(st.audience, req.user._id) )) return res.status(404).json({ error: "Not found" });
      if (String(st.userId._id) !== String(req.user._id) && !(await canSee(req.user, st.userId._id))) return res.status(404).json({ error: "Not found" });
      snap = { _id: st._id, source: "status", videoUrl: st.content, poster: "", caption: st.caption || "", filter: "none", trim: st.trim?.end > 0 ? { start: st.trim.start || 0, end: st.trim.end } : null, song: st.song?.url ? { url: st.song.url, name: st.song.name, start: st.song.start || 0 } : null, createdAt: st.createdAt, user: { _id: st.userId._id, fullName: st.userId.fullName, profilePic: st.userId.profilePic }, likeCount: 0, liked: false, views: 0, comments: 0, saves: 0, reposts: 0, mine: false, following: false };
    } else {
      snap = { ...snapshot, source: "discover" };
      if (typeof snap.videoUrl !== "string" || !/^https:\/\//.test(snap.videoUrl)) return res.status(400).json({ error: "Invalid" });
    }
    const r = await SavedReel.updateOne({ userId: req.user._id, key }, { $setOnInsert: { userId: req.user._id, key, snapshot: snap } }, { upsert: true });
    if (r.upsertedCount && key.startsWith("reel:")) await Reel.updateOne({ _id: key.slice(5) }, { $inc: { saves: 1 } });
    res.status(200).json({ saved: true });
  } catch (error) {
    console.log("Error in toggleSave:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getSaved = async (req, res) => {
  try {
    const rows = await SavedReel.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.set("Cache-Control", "no-store");
    res.status(200).json({ reels: rows.map((r) => ({ ...r.snapshot, saved: true, liked: false })), more: false });
  } catch (error) {
    console.log("Error in getSaved:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// A person's own reels for their profile grid (only if I'm allowed to see them).
export const getUserReels = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(404).json({ error: "Not found" });
    if (String(userId) !== String(req.user._id) && !(await canSee(req.user, userId))) return res.status(200).json({ reels: [] });
    const rows = await Reel.find({ userId }).sort({ createdAt: -1 }).limit(60).populate("userId", "fullName profilePic").lean();
    const shaped = await withCounts(rows, req.user._id);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ reels: shaped.map((r) => ({ _id: r._id, videoUrl: r.videoUrl, poster: r.poster, views: r.views, likeCount: r.likeCount, duration: r.duration, createdAt: r.createdAt })) });
  } catch (error) {
    console.log("Error in getUserReels:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getReel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const r = await Reel.findById(req.params.id).populate("userId", "fullName profilePic").lean();
    if (!r || (r.userId && !(await canSee(req.user, r.userId._id)))) return res.status(404).json({ error: "This reel isn't available" });
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
    if (!r || (r.userId && !(await canSee(req.user, r.userId)))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.liked !== false;
    const already = (r.likes || []).some((l) => String(l) === String(req.user._id));
    const upd = await Reel.findByIdAndUpdate(req.params.id, want ? { $addToSet: { likes: req.user._id } } : { $pull: { likes: req.user._id } }, { new: true }).select("likes");
    if (want && !already && r.userId && String(r.userId) !== String(req.user._id)) {
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

// A Discover clip becomes a real reel the first time someone interacts with it, so likes, comments,
// saves, sends and reposts all work the same as on any other reel.
export const importDiscover = async (req, res) => {
  try {
    const c = req.body?.clip || {};
    const id = String(c._id || "");
    if (!/^px-\d+$/.test(id) || typeof c.videoUrl !== "string" || !/^https:\/\//.test(c.videoUrl)) return res.status(400).json({ error: "Invalid clip" });
    const reel = await Reel.findOneAndUpdate(
      { externalId: id },
      {
        $setOnInsert: {
          externalId: id,
          videoUrl: c.videoUrl,
          poster: typeof c.poster === "string" && /^https:\/\//.test(c.poster) ? c.poster : "",
          duration: Number(c.duration) || 0,
          externalAuthor: String(c.user?.fullName || "Talkies Discover").slice(0, 60),
        },
      },
      { upsert: true, new: true }
    ).lean();
    res.status(200).json((await withCounts([reel], req.user._id))[0]);
  } catch (error) {
    console.log("Error in importDiscover:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// A public video status becomes a reel of its owner (needed to send it in chat / repost it): the video is
// copied once to a public address, so it also keeps working after the 24-hour status is gone.
export const importStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const existing = await Reel.findOne({ fromStatus: req.params.id }).populate("userId", "fullName profilePic").lean();
    const st = await Status.findOne({ _id: req.params.id, type: "video", expiresAt: { $gt: new Date() } }).populate("userId", "fullName profilePic").lean();
    if (!st || !st.userId) {
      if (existing) return res.status(200).json((await withCounts([existing], req.user._id))[0]);
      return res.status(404).json({ error: "That update is gone" });
    }
    const mine = String(st.userId._id) === String(req.user._id);
    if (!mine && (!audienceAllows(st.audience, req.user._id) || !(await canSee(req.user, st.userId._id)))) return res.status(404).json({ error: "Not available" });
    if (st.audience?.mode && st.audience.mode !== "all") return res.status(403).json({ error: "This update is private, so it can't be shared" });
    if (existing) return res.status(200).json((await withCounts([existing], req.user._id))[0]);
    const up = await cloudinary.uploader.upload(deliveryUrl(st.content), { folder: "chat-app/reels", resource_type: "video" });
    const reel = await Reel.create({
      userId: st.userId._id,
      fromStatus: st._id,
      videoUrl: up.secure_url,
      poster: up.secure_url.replace(/\.[a-z0-9]+$/i, ".jpg"),
      caption: st.caption || "",
      duration: up.duration || 0,
      trim: st.trim?.end > 0 ? { start: st.trim.start || 0, end: st.trim.end } : { start: 0, end: 0 },
    });
    await reel.populate("userId", "fullName profilePic");
    res.status(200).json((await withCounts([reel.toObject()], req.user._id))[0]);
  } catch (error) {
    console.log("Error in importStatus:", error.message);
    res.status(500).json({ error: "Couldn't share that update" });
  }
};

export const repostReel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const r = await Reel.findById(req.params.id).select("userId").lean();
    if (!r || (r.userId && !(await canSee(req.user, r.userId)))) return res.status(404).json({ error: "Not found" });
    const want = req.body?.reposted !== false;
    if (want) {
      const u = await Repost.updateOne({ userId: req.user._id, reelId: r._id }, { $setOnInsert: { userId: req.user._id, reelId: r._id } }, { upsert: true });
      if (u.upsertedCount) {
        await Reel.updateOne({ _id: r._id }, { $inc: { reposts: 1 } });
        if (r.userId && String(r.userId) !== String(req.user._id)) {
          sendPushToUser(r.userId, { title: "Talkies", body: `🔁 ${req.user.fullName} reposted your reel`, icon: req.user.profilePic || "/icon-v2-192.png", tag: `reel-repost-${r._id}`, data: { url: `/reels?r=${r._id}` } }).catch(() => {});
        }
      }
    } else {
      const d = await Repost.deleteOne({ userId: req.user._id, reelId: r._id });
      if (d.deletedCount) await Reel.updateOne({ _id: r._id, reposts: { $gt: 0 } }, { $inc: { reposts: -1 } });
    }
    const fresh = await Reel.findById(r._id).select("reposts").lean();
    res.status(200).json({ reposted: want, reposts: fresh?.reposts || 0 });
  } catch (error) {
    console.log("Error in repostReel:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
