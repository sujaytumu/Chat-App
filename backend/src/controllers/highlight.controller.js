import { visibleUserIds } from "../lib/visibility.js";
import mongoose from "mongoose";
import Highlight from "../models/highlight.model.js";
import Status from "../models/status.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";

const MAX_HIGHLIGHTS = 20;
const MAX_ITEMS = 50;
const MAX_TITLE = 20;

// Same audience rule as statuses: "all", "except" (everyone but the listed) or "only" (just the listed).
const canSee = (item, viewerId) => {
  const a = item.audience;
  if (!a || !a.mode || a.mode === "all") return true;
  const listed = (a.users || []).some((u) => String(u) === String(viewerId));
  return a.mode === "only" ? listed : !listed;
};

const cleanTitle = (t) => (typeof t === "string" ? t.trim().slice(0, MAX_TITLE) : "");

const toItem = (s) => ({
  sourceId: s._id,
  type: s.type,
  content: s.content,
  caption: s.caption || "",
  file: s.file?.name || s.file?.mime || s.file?.size ? { name: s.file.name, size: s.file.size, mime: s.file.mime } : undefined,
  trim: s.trim?.end != null ? { start: s.trim.start, end: s.trim.end } : undefined,
  song: s.song?.url ? { url: s.song.url, name: s.song.name } : undefined,
  location: s.location?.name ? { name: s.location.name, lat: s.location.lat, lng: s.location.lng } : undefined,
  backgroundColor: s.backgroundColor,
  font: s.font,
  audience: s.audience?.mode ? { mode: s.audience.mode, users: s.audience.users || [] } : undefined,
  postedAt: s.createdAt || new Date(),
  // keep the views and hearts the status already had
  viewedBy: s.viewedBy || [],
  views: (s.views || []).filter((v) => v.user).map((v) => ({ user: v.user, at: v.at })),
  likes: (s.likes || []).filter((l) => l.user).map((l) => ({ user: l.user, at: l.at })),
});

const ids = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(String))].filter((id) => mongoose.isValidObjectId(id));

// What a viewer is allowed to get: the owner sees everything, others only the items meant for them.
// `createdAt` mirrors the original post time so the status viewer can show it unchanged.
const present = (h, viewerId) => {
  const mine = String(h.userId?._id || h.userId) === String(viewerId);
  const items = h.items
    .filter((it) => mine || canSee(it, viewerId))
    .map((it) => {
      const o = it.toObject ? it.toObject() : { ...it };
      o.createdAt = o.postedAt;
      if (!mine) {
        delete o.audience; // nobody else learns who was left out
        // other people only learn whether THEY hearted it
        o.liked = (o.likes || []).some((l) => String(l.user?._id || l.user) === String(viewerId));
        delete o.likes;
        delete o.views;
        delete o.viewedBy;
      }
      return o;
    });
  return { _id: h._id, title: h.title, cover: h.cover || "", updatedAt: h.updatedAt, user: h.userId?._id ? h.userId : undefined, items };
};

// Highlights of one person
export const getUserHighlights = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "Invalid user" });
    res.set("Cache-Control", "no-store");
    const mine = String(userId) === String(req.user._id);
    let q = Highlight.find({ userId }).sort({ createdAt: 1 });
    if (mine) q = q.populate("items.views.user items.likes.user", "fullName profilePic"); // the owner sees who viewed / hearted
    const list = await q;
    const out = list.map((h) => present(h, req.user._id)).filter((h) => mine || h.items.length > 0);
    res.status(200).json(out);
  } catch (error) {
    console.log("Error in getUserHighlights controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Everyone else's highlights, grouped by person (for the Updates page)
export const getHighlightsFeed = async (req, res) => {
  try {
    const myId = req.user._id;
    res.set("Cache-Control", "no-store");
    const visible = await visibleUserIds(req.user);
    const list = await Highlight.find({ userId: visible ? { $in: [...visible], $ne: myId } : { $ne: myId } })
      .sort({ updatedAt: -1 })
      .limit(150)
      .populate("userId", "fullName profilePic");
    const byUser = new Map();
    for (const h of list) {
      if (!h.userId) continue; // account deleted
      const p = present(h, myId);
      if (!p.items.length) continue;
      const uid = String(h.userId._id);
      if (!byUser.has(uid)) byUser.set(uid, { user: h.userId, highlights: [] });
      byUser.get(uid).highlights.push(p);
    }
    res.status(200).json(Array.from(byUser.values()));
  } catch (error) {
    console.log("Error in getHighlightsFeed controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createHighlight = async (req, res) => {
  try {
    const myId = req.user._id;
    const title = cleanTitle(req.body?.title) || "Highlights";
    const statusIds = ids(req.body?.statusIds).slice(0, MAX_ITEMS);
    if (!statusIds.length) return res.status(400).json({ error: "Pick at least one status" });
    if ((await Highlight.countDocuments({ userId: myId })) >= MAX_HIGHLIGHTS) {
      return res.status(400).json({ error: `You can have up to ${MAX_HIGHLIGHTS} highlights` });
    }
    const found = await Status.find({ _id: { $in: statusIds }, userId: myId }).sort({ createdAt: 1 });
    if (!found.length) return res.status(404).json({ error: "Those statuses are no longer available" });
    const h = await Highlight.create({ userId: myId, title, items: found.map(toItem) });
    res.status(201).json(present(h, myId));
  } catch (error) {
    console.log("Error in createHighlight controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Rename, change the cover, add statuses, remove items
export const updateHighlight = async (req, res) => {
  try {
    const myId = req.user._id;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Highlight not found" });
    const h = await Highlight.findOne({ _id: req.params.id, userId: myId });
    if (!h) return res.status(404).json({ error: "Highlight not found" });

    const { title, cover, addStatusIds, removeItemIds } = req.body || {};
    if (title !== undefined) {
      const t = cleanTitle(title);
      if (!t) return res.status(400).json({ error: "Give the highlight a name" });
      h.title = t;
    }

    const remove = new Set(ids(removeItemIds));
    if (remove.size) h.items = h.items.filter((it) => !remove.has(String(it._id)));

    const add = ids(addStatusIds);
    if (add.length) {
      const have = new Set(h.items.map((it) => String(it.sourceId)));
      const fresh = (await Status.find({ _id: { $in: add }, userId: myId }).sort({ createdAt: 1 })).filter((s) => !have.has(String(s._id)));
      if (h.items.length + fresh.length > MAX_ITEMS) return res.status(400).json({ error: `A highlight can hold ${MAX_ITEMS} updates` });
      for (const s of fresh) h.items.push(toItem(s));
    }

    if (h.items.length === 0) {
      await Highlight.deleteOne({ _id: h._id });
      return res.status(200).json({ deleted: true, _id: h._id });
    }

    if (cover !== undefined) {
      // only a picture that is actually inside this highlight can be the cover
      h.cover = typeof cover === "string" && h.items.some((it) => it.type === "image" && it.content === cover) ? cover : "";
    } else if (h.cover && !h.items.some((it) => it.content === h.cover)) {
      h.cover = ""; // the cover picture was removed
    }

    await h.save();
    res.status(200).json(present(h, myId));
  } catch (error) {
    console.log("Error in updateHighlight controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteHighlight = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Highlight not found" });
    const r = await Highlight.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!r.deletedCount) return res.status(404).json({ error: "Highlight not found" });
    res.status(200).json({ message: "Highlight deleted" });
  } catch (error) {
    console.log("Error in deleteHighlight controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// A highlight item the viewer is allowed to open (owner or in the item's audience).
const findItem = async (req) => {
  const { id, itemId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(itemId)) return null;
  const h = await Highlight.findById(id).select("userId items._id items.audience");
  const item = h?.items.id(itemId);
  if (!h || !item) return null;
  if (String(h.userId) !== String(req.user._id) && !canSee(item, req.user._id)) return null;
  return { h, item };
};

// Someone opened an item of a highlight: count it once and tell the owner right away.
export const markHighlightItemViewed = async (req, res) => {
  try {
    const found = await findItem(req);
    if (!found) return res.status(404).json({ error: "Highlight not found" });
    const myId = req.user._id;
    if (String(found.h.userId) !== String(myId)) {
      const r = await Highlight.updateOne(
        { _id: found.h._id, items: { $elemMatch: { _id: req.params.itemId, viewedBy: { $ne: myId } } } },
        { $push: { "items.$.viewedBy": myId, "items.$.views": { user: myId, at: new Date() } } }
      );
      if (r.modifiedCount > 0) {
        const socketId = getReceiverSocketId(String(found.h.userId));
        if (socketId) {
          io.to(socketId).emit("statusViewed", {
            statusId: req.params.itemId,
            user: { _id: String(myId), fullName: req.user.fullName, profilePic: req.user.profilePic },
            at: new Date().toISOString(),
          });
        }
      }
    }
    res.status(200).json({ message: "Marked as viewed" });
  } catch (error) {
    console.log("Error in markHighlightItemViewed controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Heart / un-heart a highlight item. The owner is told when it is hearted.
export const likeHighlightItem = async (req, res) => {
  try {
    const found = await findItem(req);
    if (!found) return res.status(404).json({ error: "Highlight not found" });
    const myId = req.user._id;
    if (String(found.h.userId) === String(myId)) return res.status(400).json({ error: "You can't like your own highlight" });
    const liked = req.body?.liked !== false;
    if (liked) {
      const r = await Highlight.updateOne(
        { _id: found.h._id, items: { $elemMatch: { _id: req.params.itemId, "likes.user": { $ne: myId } } } },
        { $push: { "items.$.likes": { user: myId, at: new Date() } } }
      );
      if (r.modifiedCount > 0) {
        const ownerId = String(found.h.userId);
        const socketId = getReceiverSocketId(ownerId);
        if (socketId) {
          io.to(socketId).emit("statusLiked", {
            statusId: req.params.itemId,
            user: { _id: String(myId), fullName: req.user.fullName, profilePic: req.user.profilePic },
          });
        }
        sendPushToUser(ownerId, {
          title: "Talkies",
          body: `❤️ ${req.user.fullName} liked your highlight`,
          icon: req.user.profilePic || "/icon-v2-192.png",
          tag: `highlight-like-${req.params.itemId}`,
          data: { url: "/status" },
        });
      }
    } else {
      await Highlight.updateOne(
        { _id: found.h._id, "items._id": req.params.itemId },
        { $pull: { "items.$.likes": { user: myId } } }
      );
    }
    res.status(200).json({ liked });
  } catch (error) {
    console.log("Error in likeHighlightItem controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
