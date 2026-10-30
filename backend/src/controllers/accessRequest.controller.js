import mongoose from "mongoose";
import AccessRequest from "../models/accessRequest.model.js";
import User from "../models/user.model.js";
import { OWNER_EMAIL, isOwner, Visibility } from "../lib/visibility.js";
import { io, getReceiverSocketId } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";

// After a "no" the person can ask again straight away, 3 times in a row; after every third "no" they wait 1 hour,
// then get 3 more tries, and so on.
const HOUR = 60 * 60 * 1000;
const retryAtFor = (r) => {
  if (!r || r.status !== "declined" || !r.declinedAt) return null;
  if ((r.declines || 0) % 3 !== 0) return null;
  const at = new Date(r.declinedAt).getTime() + HOUR;
  return at > Date.now() ? at : null;
};

const tell = (userId, event, payload) => {
  const sid = getReceiverSocketId(String(userId));
  if (sid) io.to(sid).emit(event, payload);
};

// Anyone: where does my request stand?
export const myRequest = async (req, res) => {
  try {
    const r = await AccessRequest.findOne({ userId: req.user._id }).select("status updatedAt declines declinedAt").lean();
    res.set("Cache-Control", "no-store");
    res.json({ owner: isOwner(req.user), status: r?.status || "none", retryAt: retryAtFor(r) });
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
    const retryAt = retryAtFor(existing);
    if (retryAt) return res.status(429).json({ error: "Please wait a while before asking again", retryAt });
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
    // Names of the people this person may now see (the owner is always included, so not listed)
    let names = [];
    if (status === "approved") {
      const rows = await Visibility.find({ $or: [{ a: userId }, { b: userId }] }).select("a b").lean();
      const ids = rows.map((r) => (String(r.a) === String(userId) ? r.b : r.a));
      const people = await User.find({ _id: { $in: ids }, email: { $ne: OWNER_EMAIL }, deleted: { $ne: true } }).select("fullName").lean();
      names = people.map((p) => p.fullName).filter(Boolean);
      // An approval with nobody chosen would tell the person "approved" while changing nothing for them.
      if (!names.length) return res.status(400).json({ error: "Choose at least one person before approving" });
    }
    await AccessRequest.updateOne(
      { userId },
      status === "declined" ? { $set: { status, declinedAt: new Date() }, $inc: { declines: 1 } } : { $set: { status, declines: 0, declinedAt: null } }
    );
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
