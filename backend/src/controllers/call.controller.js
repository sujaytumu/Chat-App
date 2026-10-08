import CallLog from "../models/callLog.model.js";
import { declineCallFor } from "../lib/socket.js";

export const getCallHistory = async (req, res) => {
  try {
    const myId = req.user._id;
    const calls = await CallLog.find({ $or: [{ callerId: myId }, { calleeId: myId }] })
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
  res.status(200).json({ iceServers, hasTurn: iceServers.length > 2 });
};

// Decline an incoming call from a notification button (no open socket needed).
export const declineCall = (req, res) => {
  const callerId = String(req.body?.callerId || "");
  if (!callerId) return res.status(400).json({ error: "callerId required" });
  declineCallFor(String(req.user._id), callerId);
  res.status(200).json({ ok: true });
};
