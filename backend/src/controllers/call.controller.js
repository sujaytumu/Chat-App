import crypto from "crypto";
import { cleanRepeat, cleanTz, MAX_SCHEDULE_MS } from "../lib/recurrence.js";
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
      .limit(100)
      .lean();

    res.status(200).json(calls.filter((c) => c.callerId && c.calleeId));
  } catch (error) {
    console.log("Error in getCallHistory controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Call statistics for the signed-in person: totals, and who they talk to most.
// GET /api/calls/stats?days=7|30|90|365  (no days = all time). Read-only: nothing else depends on it.
export const getCallStats = async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(String(req.user._id)); // aggregation does not cast ids by itself
    const days = [7, 30, 90, 365].includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 0;
    const match = { $or: [{ callerId: myId }, { calleeId: myId }], hiddenFor: { $ne: myId } };
    if (days) match.createdAt = { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) };

    const rows = await CallLog.aggregate([
      { $match: match },
      {
        $addFields: {
          iCalled: { $eq: ["$callerId", myId] },
          peer: { $cond: [{ $eq: ["$callerId", myId] }, "$calleeId", "$callerId"] },
          secs: { $cond: [{ $eq: ["$status", "answered"] }, { $ifNull: ["$durationSeconds", 0] }, 0] },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                calls: { $sum: 1 },
                answered: { $sum: { $cond: [{ $eq: ["$status", "answered"] }, 1, 0] } },
                outgoing: { $sum: { $cond: ["$iCalled", 1, 0] } },
                incoming: { $sum: { $cond: ["$iCalled", 0, 1] } },
                missedIncoming: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "missed"] }, { $not: ["$iCalled"] }] }, 1, 0] } },
                noAnswerOutgoing: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "missed"] }, "$iCalled"] }, 1, 0] } },
                declined: { $sum: { $cond: [{ $eq: ["$status", "declined"] }, 1, 0] } },
                video: { $sum: { $cond: [{ $eq: ["$callType", "video"] }, 1, 0] } },
                audio: { $sum: { $cond: [{ $eq: ["$callType", "audio"] }, 1, 0] } },
                totalSeconds: { $sum: "$secs" },
                longestSeconds: { $max: "$secs" },
                dataBytes: { $sum: { $ifNull: ["$dataBytes", 0] } },
              },
            },
          ],
          people: [
            {
              $group: {
                _id: "$peer",
                calls: { $sum: 1 },
                answered: { $sum: { $cond: [{ $eq: ["$status", "answered"] }, 1, 0] } },
                missed: { $sum: { $cond: [{ $eq: ["$status", "missed"] }, 1, 0] } },
                totalSeconds: { $sum: "$secs" },
                lastCallAt: { $max: "$createdAt" },
              },
            },
            { $sort: { totalSeconds: -1, calls: -1 } },
            { $limit: 10 },
          ],
          byHour: [{ $group: { _id: { $hour: "$createdAt" }, calls: { $sum: 1 } } }, { $sort: { calls: -1 } }, { $limit: 1 }],
        },
      },
    ]);

    const t = rows[0]?.totals?.[0] || {};
    const totals = {
      calls: t.calls || 0,
      answered: t.answered || 0,
      outgoing: t.outgoing || 0,
      incoming: t.incoming || 0,
      missedIncoming: t.missedIncoming || 0,
      noAnswerOutgoing: t.noAnswerOutgoing || 0,
      declined: t.declined || 0,
      video: t.video || 0,
      audio: t.audio || 0,
      totalSeconds: t.totalSeconds || 0,
      averageSeconds: t.answered ? Math.round((t.totalSeconds || 0) / t.answered) : 0,
      longestSeconds: t.longestSeconds || 0,
      dataBytes: t.dataBytes || 0,
    };

    const peers = rows[0]?.people || [];
    const User = mongoose.model("User");
    const users = await User.find({ _id: { $in: peers.map((p) => p._id) } }).select("fullName profilePic").lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const topPeople = peers
      .filter((p) => byId.has(String(p._id)))
      .map((p) => ({
        user: byId.get(String(p._id)),
        calls: p.calls,
        answered: p.answered,
        missed: p.missed,
        totalSeconds: p.totalSeconds,
        lastCallAt: p.lastCallAt,
      }));

    res.status(200).json({ days: days || null, totals, topPeople, busiestHour: rows[0]?.byHour?.[0]?._id ?? null });
  } catch (error) {
    console.log("Error in getCallStats controller:", error.message);
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
// Metered.ca TURN with the account's own key (free tier): METERED_APP (the name before .metered.live) and
// METERED_API_KEY. Short-lived credentials are fetched here and remembered for 10 minutes.
let meteredCache = { at: 0, servers: null };
async function fetchMeteredServers() {
  const app = process.env.METERED_APP;
  const key = process.env.METERED_API_KEY;
  if (!app || !key) return null;
  if (meteredCache.servers && Date.now() - meteredCache.at < 10 * 60_000) return meteredCache.servers;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://${encodeURIComponent(app)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length) meteredCache = { at: Date.now(), servers: list };
    }
  } catch {
    /* keep the last good list */
  } finally {
    clearTimeout(timer);
  }
  return meteredCache.servers;
}

export const getIceConfig = async (req, res) => {
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
  const metered = await fetchMeteredServers();
  if (metered) iceServers.push(...metered);
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
  const callId = String(req.body?.callId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || undefined;
  declineCallFor(String(req.user._id), callerId, callId);
  res.status(200).json({ ok: true });
};

// ---- Call links and scheduled calls ----
const DAY = 24 * 60 * 60 * 1000;
const publicLink = (l, extra = {}) => ({
  code: l.code,
  callType: l.callType,
  title: l.title,
  scheduledFor: l.scheduledFor,
  repeat: l.repeat || "none",
  repeatUntil: l.repeatUntil || null,
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
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000 || when.getTime() > Date.now() + MAX_SCHEDULE_MS) {
        return res.status(400).json({ error: "Pick a time within the next year" });
      }
    }
    const repeat = when ? cleanRepeat(req.body?.repeat) : "none";
    const repeatUntil = repeat === "none" ? null : new Date(Date.now() + MAX_SCHEDULE_MS); // repeats for at most one year
    const ids = Array.isArray(invitees)
      ? [...new Set(invitees.map(String))].filter((id) => mongoose.isValidObjectId(id) && id !== String(req.user._id)).slice(0, 9)
      : [];
    const link = await CallLink.create({
      code: crypto.randomBytes(8).toString("base64url"),
      creatorId: req.user._id,
      callType: callType === "video" ? "video" : "audio",
      title: typeof title === "string" ? title.trim().slice(0, 60) : "",
      scheduledFor: when,
      repeat,
      repeatUntil,
      firstAt: when,
      tz: cleanTz(req.body?.tz),
      invitees: ids,
      // a repeating call keeps its link alive until its last date
      expiresAt: new Date(repeatUntil ? repeatUntil.getTime() + 12 * 3600 * 1000 : when ? when.getTime() + 12 * 3600 * 1000 : Date.now() + 30 * DAY),
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
