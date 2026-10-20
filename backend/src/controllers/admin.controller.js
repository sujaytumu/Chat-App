import mongoose from "mongoose";
import User from "../models/user.model.js";
import { Visibility, pairKey, isOwner, forgetVisibility } from "../lib/visibility.js";
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
    res.status(200).json({ users, pairs: pairs.map((p) => [String(p.a), String(p.b)]) });
  } catch (e) {
    console.log("Error in listAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setAccess = async (req, res) => {
  try {
    const { a, b, allowed } = req.body || {};
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
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("Error in setAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
