import mongoose from "mongoose";
import User from "../models/user.model.js";
import AccessRequest from "../models/accessRequest.model.js";
import { sendPushToUser } from "../lib/webPush.js";
import { Visibility, pairKey, isOwner, forgetVisibility, ownerId, VISIBILITY_KINDS } from "../lib/visibility.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { endOtherSessions, wipeAccount } from "./auth.controller.js";

// Owner only: see everyone, and choose who can see whom.
export const requireOwner = (req, res, next) => (isOwner(req.user) ? next() : res.status(403).json({ error: "Owner only" }));

export const listAccess = async (req, res) => {
  try {
    const [users, pairs] = await Promise.all([
      User.find({ deleted: { $ne: true } }).select("fullName email profilePic").sort({ fullName: 1 }).lean(),
      Visibility.find({}).select("a b hide").lean(),
    ]);
    res.set("Cache-Control", "no-store");
    // hides: "idA|idB" (sorted) -> the kinds of content (status / highlights / reels / posts) those two do NOT see of each other
    const hides = {};
    for (const p of pairs) if (p.hide?.length) hides[[String(p.a), String(p.b)].sort().join("|")] = p.hide;
    res.status(200).json({ users, pairs: pairs.map((p) => [String(p.a), String(p.b)]), hides, kinds: VISIBILITY_KINDS, ownerId: await ownerId() });
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

// Owner: for two people who can see each other, switch one kind of content (status / highlights / reels / posts) on or off.
// Strict and two-way: when it is off, neither of them sees the other's status / highlights / reels / posts.
// The owner's own content can never be switched off for anyone.
export const setAccessKind = async (req, res) => {
  try {
    const { a, b, kind, hidden } = req.body || {};
    if (!mongoose.isValidObjectId(a) || !mongoose.isValidObjectId(b) || String(a) === String(b)) return res.status(400).json({ error: "Pick two different people" });
    if (!VISIBILITY_KINDS.includes(kind)) return res.status(400).json({ error: "Unknown kind" });
    const owner = await ownerId();
    if (owner && (String(a) === owner || String(b) === owner)) return res.status(400).json({ error: "The owner is always visible to everyone" });
    const upd = await Visibility.updateOne({ key: pairKey(a, b) }, hidden === true ? { $addToSet: { hide: kind } } : { $pull: { hide: kind } });
    if (!upd.matchedCount) return res.status(404).json({ error: "These two can't see each other yet" });
    forgetVisibility();
    for (const uid of [String(a), String(b)]) {
      const sid = getReceiverSocketId(uid);
      if (sid) io.to(sid).emit("visibilityChanged");
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("Error in setAccessKind:", e.message);
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

// Owner only: a way back into an account when its email can't receive the reset code, or the email itself is forgotten.
// Makes a temporary password (shown once, to the owner), signs that person out everywhere, and the owner passes it on.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike characters (0/O, 1/l/I)
export const resetUserPassword = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Person not found" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Person not found" });
    const temp = Array.from({ length: 10 }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join("");
    user.password = await bcrypt.hash(temp, await bcrypt.genSalt(10));
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordReset = undefined;
    await user.save();
    endOtherSessions(user._id);
    console.log(`owner reset the password of ${user.email.slice(0, 3)}***`);
    res.set("Cache-Control", "no-store");
    res.json({ tempPassword: temp, email: user.email, fullName: user.fullName });
  } catch (e) {
    console.log("resetUserPassword:", e.message);
    res.status(500).json({ error: "Couldn't reset the password" });
  }
};

// Owner only: erase someone's account for good (profile wiped, out of every group, statuses gone, signed out
// everywhere). Messages already sent stay in other people's chats. The owner's own account cannot be erased here.
export const deleteUserByOwner = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Person not found" });
    const user = await User.findById(req.params.id).select("+deletedGroups");
    if (!user || user.deleted) return res.status(404).json({ error: "Person not found" });
    if (isOwner(user) || String(user._id) === String(req.user._id)) return res.status(400).json({ error: "The owner account can't be deleted here" });
    const label = `${String(user.email || "").slice(0, 3)}***`;
    await wipeAccount(user);
    await endOtherSessions(user._id);
    console.log(`owner erased account ${user._id} (${label})`);
    res.json({ ok: true });
  } catch (e) {
    console.log("deleteUserByOwner:", e.message);
    res.status(500).json({ error: "Couldn't delete the account" });
  }
};
