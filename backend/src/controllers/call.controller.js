import crypto from "crypto";
import mongoose from "mongoose";
import CallLink from "../models/callLink.model.js";
import { linkCallLive, linkCallCount } from "../lib/socket.js";
import { sendPushToUsers } from "../lib/webPush.js";
import CallLog from "../models/callLog.model.js";
import { declineCallFor } from "../lib/socket.js";

export const getCallHistory = async (req, res) => {
  try {
    const myId = req.user._id;
    const calls = await CallLog.find({ $or: [{ callerId: myId }, { calleeId: myId }], hiddenFor: { $ne: myId } })
      .populate("callerId", "fullName profilePic")
      .populate("calleeId", "fullName profilePic")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json(calls.filter((c) => c.callerId && c.calleeId));
  } catch (error) {
    console.log("Error in getCallHistory controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// "Clear call log": hides every entry from MY list only.
export const clearCallHistory = async (req, res) => {
  try {
    const myId = req.user._id;
    await CallLog.updateMany({ $or: [{ callerId: myId }, { calleeId: myId }] }, { $addToSet: { hiddenFor: myId } });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in clearCallHistory controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ICE (STUN/TURN) servers for WebRTC. Configure a TURN relay on the server with
//   TURN_URLS=turn:host:80,turns:host:443?transport=tcp
//   TURN_USERNAME=...   TURN_CREDENTIAL=...
// Without a working TURN relay, calls between two different networks (e.g. a
// phone on mobile data + a laptop on Wi-Fi) often connect "silently" with no
// audio, then drop with "connection lost".
export const getIceConfig = (req, res) => {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const urls = (process.env.TURN_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  if (iceServers.length === 2) {
    // No private TURN configured: fall back to the free public relay so calls
    // between different networks (mobile data <-> Wi-Fi) still carry audio.
    // Best-effort only — set TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL for a reliable one.
    iceServers.push({
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
    return res.status(200).json({ iceServers, hasTurn: true });
  }
  res.status(200).json({ iceServers, hasTurn: iceServers.length > 2 });
};

// Decline an incoming call from a notification button (no open socket needed).
export const declineCall = (req, res) => {
  const callerId = String(req.body?.callerId || "");
  if (!callerId) return res.status(400).json({ error: "callerId required" });
  declineCallFor(String(req.user._id), callerId);
  res.status(200).json({ ok: true });
};

// ---- Call links and scheduled calls ----
const DAY = 24 * 60 * 60 * 1000;
const publicLink = (l, extra = {}) => ({
  code: l.code,
  callType: l.callType,
  title: l.title,
  scheduledFor: l.scheduledFor,
  creatorId: String(l.creatorId?._id || l.creatorId),
  creatorName: l.creatorId?.fullName,
  invitees: (l.invitees || []).map(String),
  live: linkCallLive(l.code),
  participants: linkCallCount(l.code),
  ...extra,
});
const fmtWhen = (d) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export const createCallLink = async (req, res) => {
  try {
    const { callType, title, scheduledFor, invitees } = req.body || {};
    let when = null;
    if (scheduledFor) {
      when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000 || when.getTime() > Date.now() + 90 * DAY) {
        return res.status(400).json({ error: "Pick a time in the next 90 days" });
      }
    }
    const ids = Array.isArray(invitees)
      ? [...new Set(invitees.map(String))].filter((id) => mongoose.isValidObjectId(id) && id !== String(req.user._id)).slice(0, 9)
      : [];
    const link = await CallLink.create({
      code: crypto.randomBytes(8).toString("base64url"),
      creatorId: req.user._id,
      callType: callType === "video" ? "video" : "audio",
      title: typeof title === "string" ? title.trim().slice(0, 60) : "",
      scheduledFor: when,
      invitees: ids,
      expiresAt: new Date((when ? when.getTime() + 12 * 3600 * 1000 : Date.now() + 30 * DAY)),
    });
    if (when && ids.length) {
      sendPushToUsers(ids, {
        title: link.title || "Scheduled call",
        body: `${req.user.fullName} scheduled a ${link.callType} call for ${fmtWhen(when)}`,
        icon: req.user.profilePic || "/icon-v2-192.png",
        tag: `call-link-${link.code}`,
        data: { url: `/call/${link.code}`, callCode: link.code },
      });
    }
    res.status(201).json(publicLink(link));
  } catch (error) {
    console.log("Error in createCallLink:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// My upcoming scheduled calls (made by me or inviting me) and my open links.
export const myCallLinks = async (req, res) => {
  try {
    const me = req.user._id;
    const links = await CallLink.find({ expiresAt: { $gt: new Date() }, $or: [{ creatorId: me }, { invitees: me }] })
      .sort({ scheduledFor: 1, createdAt: -1 })
      .limit(50)
      .populate("creatorId", "fullName");
    res.status(200).json(links.map((l) => publicLink(l)));
  } catch (error) {
    console.log("Error in myCallLinks:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getCallLink = async (req, res) => {
  try {
    const link = await CallLink.findOne({ code: req.params.code, expiresAt: { $gt: new Date() } }).populate("creatorId", "fullName");
    if (!link) return res.status(404).json({ error: "This call link has expired" });
    res.status(200).json(publicLink(link));
  } catch (error) {
    console.log("Error in getCallLink:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteCallLink = async (req, res) => {
  try {
    const r = await CallLink.deleteOne({ code: req.params.code, creatorId: req.user._id });
    res.status(r.deletedCount ? 200 : 404).json({ ok: !!r.deletedCount });
  } catch (error) {
    console.log("Error in deleteCallLink:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
