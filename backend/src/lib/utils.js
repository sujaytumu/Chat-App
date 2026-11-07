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

// A login stays valid for 60 days and is renewed while the app is being used
// (see renewToken), so someone who opens the app now and then is never asked to sign in again.
const SESSION_DAYS = 60;
const RENEW_AFTER_SECONDS = 24 * 60 * 60; // renew at most once a day

const setSessionCookie = (res, token) => {
  res.cookie("jwt", token, {
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000, // MS
    httpOnly: true, // prevent XSS attacks cross-site scripting attacks
    sameSite: "strict", // CSRF attacks cross-site request forgery attacks
    secure: process.env.NODE_ENV !== "development",
  });
};

// Sliding session: hand the same login (same device entry, same token version) a fresh
// 60 days. Called after the token has already been verified; never creates a new device entry.
export const renewToken = (req, res) => {
  try {
    const old = req.cookies?.jwt ? jwt.decode(req.cookies.jwt) : null;
    if (!old?.userId || !old?.iat) return;
    if (Date.now() / 1000 - old.iat < RENEW_AFTER_SECONDS) return;
    const payload = { userId: old.userId, tv: old.tv || 0 };
    if (old.sid) payload.sid = old.sid;
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
    setSessionCookie(res, token);
  } catch {
    // renewing is a convenience; the current cookie keeps working
  }
};

export const generateToken = (userId, res, tokenVersion = 0, req = null) => {
  const sid = crypto.randomBytes(12).toString("hex");
  const token = jwt.sign({ userId, tv: tokenVersion, sid }, process.env.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  });

  setSessionCookie(res, token);

  // Remember this login for the Linked devices list (best effort; never blocks signing in)
  const now = new Date();
  const entry = { sid, tv: tokenVersion, device: deviceLabel(req?.headers?.["user-agent"] || ""), createdAt: now, lastActive: now };
  User.updateOne({ _id: userId }, { $push: { sessions: { $each: [entry], $slice: -12 } } }).catch(() => {});

  return token;
};
