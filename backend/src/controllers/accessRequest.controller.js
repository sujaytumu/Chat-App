import mongoose from "mongoose";
import AccessRequest from "../models/accessRequest.model.js";
import User from "../models/user.model.js";
import { OWNER_EMAIL, isOwner, Visibility } from "../lib/visibility.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";

const tell = (userId, event, payload) => {
  const sid = getReceiverSocketId(String(userId));
  if (sid) io.to(sid).emit(event, payload);
};

// Anyone: where does my request stand?
export const myRequest = async (req, res) => {
  try {
    const r = await AccessRequest.findOne({ userId: req.user._id }).select("status updatedAt").lean();
    res.set("Cache-Control", "no-store");
    res.json({ owner: isOwner(req.user), status: r?.status || "none" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

// A person asks the owner to let them see other people.
export const requestAccess = async (req, res) => {
  try {
    if (isOwner(req.user)) return res.status(400).json({ error: "You are the owner" });
    const note = String(req.body?.note || "").trim().slice(0, 200);
    const existing = await AccessRequest.findOne({ userId: req.user._id });
    if (existing?.status === "pending") return res.json({ status: "pending" });
    await AccessRequest.findOneAndUpdate({ userId: req.user._id }, { $set: { status: "pending", note } }, { upsert: true });
    const owner = await User.findOne({ email: OWNER_EMAIL }).select("_id").lean();
    if (owner) {
      tell(owner._id, "accessRequest", { userId: String(req.user._id), fullName: req.user.fullName, profilePic: req.user.profilePic || "" });
      sendPushToUser(owner._id, {
        title: "Access request",
        body: `${req.user.fullName} wants to see more people on Talkies`,
        icon: req.user.profilePic || "/icon-v2-192.png",
        tag: `access-${req.user._id}`,
        data: { url: `/settings/access?user=${req.user._id}` },
      });
    }
    res.status(201).json({ status: "pending" });
  } catch (e) {
    console.log("Error in requestAccess:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Owner: who is waiting.
export const listRequests = async (req, res) => {
  try {
    const rows = await AccessRequest.find({ status: "pending" }).sort({ createdAt: 1 }).populate("userId", "fullName email profilePic").lean();
    res.set("Cache-Control", "no-store");
    res.json(rows.filter((r) => r.userId).map((r) => ({ _id: r._id, user: r.userId, note: r.note, at: r.createdAt })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

// Owner: "approved" (after choosing whom they may see) or "declined". The person is told straight away.
export const decideRequest = async (req, res) => {
  try {
    const userId = req.params.userId;
    const status = req.body?.status === "approved" ? "approved" : req.body?.status === "declined" ? "declined" : null;
    if (!mongoose.isValidObjectId(userId) || !status) return res.status(400).json({ error: "Invalid request" });
    await AccessRequest.updateOne({ userId }, { $set: { status } });
    // Names of the people this person may now see (the owner is always included, so not listed)
    let names = [];
    if (status === "approved") {
      const rows = await Visibility.find({ $or: [{ a: userId }, { b: userId }] }).select("a b").lean();
      const ids = rows.map((r) => (String(r.a) === String(userId) ? r.b : r.a));
      const people = await User.find({ _id: { $in: ids }, email: { $ne: OWNER_EMAIL }, deleted: { $ne: true } }).select("fullName").lean();
      names = people.map((p) => p.fullName).filter(Boolean);
    }
    const ownerName = String(req.user.fullName || "The owner").split(" ")[0];
    const summary = names.length ? names.slice(0, 5).join(", ") + (names.length > 5 ? ` and ${names.length - 5} more` : "") : "";
    tell(userId, "accessDecision", { status, people: names, by: ownerName });
    tell(userId, "visibilityChanged");
    sendPushToUser(userId, {
      title: "Talkies",
      body: status === "approved" ? (summary ? `${ownerName} approved you to see ${summary}` : `${ownerName} approved your request`) : "Your request to see more people was declined",
      icon: "/icon-v2-192.png",
      tag: "access-decision",
      data: { url: "/" },
    });
    res.json({ ok: true });
  } catch (e) {
    console.log("Error in decideRequest:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
