import mongoose from "mongoose";
import User from "../models/user.model.js";
import AccessRequest from "../models/accessRequest.model.js";
import { sendPushToUser } from "../lib/webPush.js";
import { Visibility, pairKey, isOwner, forgetVisibility, ownerId } from "../lib/visibility.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

// Owner only: see everyone, and choose who can see whom.
export const requireOwner = (req, res, next) => (isOwner(req.user) ? next() : res.status(403).json({ error: "Owner only" }));

export const listAccess = async (req, res) => {
  try {
    const [users, pairs] = await Promise.all([
      User.find({ deleted: { $ne: true } }).select("fullName email profilePic").sort({ fullName: 1 }).lean(),
      Visibility.find({}).select("a b").lean(),
    ]);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ users, pairs: pairs.map((p) => [String(p.a), String(p.b)]), ownerId: await ownerId() });
  } catch (e) {
    console.log("Error in listAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setAccess = async (req, res) => {
  try {
    const { a, b, allowed, skip } = req.body || {}; // skip: a person who is told by the approval message instead
    if (!mongoose.isValidObjectId(a) || !mongoose.isValidObjectId(b) || String(a) === String(b)) return res.status(400).json({ error: "Pick two different people" });
    const key = pairKey(a, b);
    if (allowed === true) {
      const [x, y] = [String(a), String(b)].sort();
      await Visibility.updateOne({ key }, { $setOnInsert: { key, a: x, b: y } }, { upsert: true });
    } else {
      await Visibility.deleteOne({ key });
    }
    forgetVisibility();
    for (const uid of [String(a), String(b)]) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("visibilityChanged"); // their contact list reloads
    }
    if (allowed === true) {
      // Tell each person who they can now chat with: nobody should get a new contact without knowing why.
      const people = await User.find({ _id: { $in: [a, b] } }).select("fullName profilePic").lean();
      const byId = new Map(people.map((p) => [String(p._id), p]));
      for (const [uid, other] of [[String(a), byId.get(String(b))], [String(b), byId.get(String(a))]]) {
        if (!other || (skip && String(skip) === uid)) continue;
        const sid = getReceiverSocketId(uid);
        if (sid) io.to(sid).emit("accessGranted", { userId: String(other._id), fullName: other.fullName, profilePic: other.profilePic || "" });
        sendPushToUser(uid, {
          title: "Talkies",
          body: `You can now chat with ${other.fullName}`,
          icon: other.profilePic || "/icon-v2-192.png",
          tag: `access-granted-${other._id}`,
          data: { url: "/" },
        });
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("Error in setAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Owner: take away everything a person was allowed to see (the owner always stays visible). They can ask again.
export const clearAccess = async (req, res) => {
  try {
    const userId = req.body?.userId;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "Pick a person" });
    const target = await User.findById(userId).select("email").lean();
    if (!target) return res.status(404).json({ error: "Person not found" });
    if (isOwner(target)) return res.status(400).json({ error: "The owner always has access" });
    const filter = { $or: [{ a: userId }, { b: userId }] };
    const rows = await Visibility.find(filter).select("a b").lean();
    await Visibility.deleteMany(filter);
    await AccessRequest.deleteOne({ userId }); // a clean slate: they can ask again
    forgetVisibility();
    const affected = new Set([String(userId), ...rows.map((r) => (String(r.a) === String(userId) ? String(r.b) : String(r.a)))]);
    for (const uid of affected) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("visibilityChanged");
    }
    const sid = getReceiverSocketId(String(userId));
    if (sid) io.to(sid).emit("accessRemoved");
    res.status(200).json({ ok: true, removed: rows.length });
  } catch (e) {
    console.log("Error in clearAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
