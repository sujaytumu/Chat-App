import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

// "Chrome on Android", "Talkies app on Android", "Safari on iPhone"...
export const deviceLabel = (ua = "") => {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "Mac" : /CrOS/i.test(ua) ? "Chromebook" : /Linux/i.test(ua) ? "Linux" : "Unknown device";
  const app = /; wv\)|Talkies/i.test(ua) && /Android/i.test(ua);
  const browser = app ? "Talkies app" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
};

export const generateToken = (userId, res, tokenVersion = 0, req = null) => {
  const sid = crypto.randomBytes(12).toString("hex");
  const token = jwt.sign({ userId, tv: tokenVersion, sid }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // MS
    httpOnly: true, // prevent XSS attacks cross-site scripting attacks
    sameSite: "strict", // CSRF attacks cross-site request forgery attacks
    secure: process.env.NODE_ENV !== "development",
  });

  // Remember this login for the Linked devices list (best effort; never blocks signing in)
  const now = new Date();
  const entry = { sid, tv: tokenVersion, device: deviceLabel(req?.headers?.["user-agent"] || ""), createdAt: now, lastActive: now };
  User.updateOne({ _id: userId }, { $push: { sessions: { $each: [entry], $slice: -12 } } }).catch(() => {});

  return token;
};
