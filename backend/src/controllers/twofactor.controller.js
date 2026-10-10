import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { generateToken } from "../lib/utils.js";
import { newSecret, verifyTotp, otpauthUrl, newBackupCodes, hashCode } from "../lib/totp.js";

// Too many wrong codes → locked for 10 minutes (per account).
const fails = new Map(); // userId -> { n, until }
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const locked = (id) => {
  const f = fails.get(String(id));
  return f && f.n >= MAX_FAILS && f.until > Date.now();
};
const recordFail = (id) => {
  const key = String(id);
  const f = fails.get(key);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  fails.set(key, { n, until: Date.now() + LOCK_MS });
};
const clearFails = (id) => fails.delete(String(id));
const LOCK_MSG = "Too many wrong codes. Try again in 10 minutes.";

const withSecrets = (id) =>
  User.findById(id).select("+twoFactor.secret +twoFactor.pendingSecret +twoFactor.backupCodes +twoFactor.lastStep");

// Accepts an authenticator code OR an unused backup code. On success returns
// { ok, step?, usedBackup? }; the caller saves the changes.
function checkSecondFactor(user, code) {
  const tf = user.twoFactor;
  const step = tf?.secret ? verifyTotp(tf.secret, code, tf.lastStep || 0) : null;
  if (step) {
    tf.lastStep = step;
    return true;
  }
  const h = hashCode(code || "");
  const codes = tf?.backupCodes || [];
  if (/^[A-Z2-7-]{10,11}$/i.test(String(code || "").trim()) && codes.includes(h)) {
    tf.backupCodes = codes.filter((c) => c !== h);
    return true;
  }
  return false;
}

// Step 2 of sign-in.
export const loginWithTwoFactor = async (req, res) => {
  try {
    const { ticket, code } = req.body || {};
    let decoded;
    try {
      decoded = jwt.verify(String(ticket || ""), process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Your sign-in timed out. Please start again." });
    }
    if (decoded.purpose !== "2fa") return res.status(400).json({ message: "Invalid request" });
    if (locked(decoded.userId)) return res.status(429).json({ message: LOCK_MSG });

    const user = await withSecrets(decoded.userId);
    if (!user?.twoFactor?.enabled) return res.status(400).json({ message: "Invalid request" });

    if (!checkSecondFactor(user, code)) {
      recordFail(user._id);
      return res.status(400).json({ message: "That code isn't right. Try again." });
    }
    clearFails(user._id);
    await user.save();
    generateToken(user._id, res);
    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      archivedChats: user.archivedChats || [],
      pinnedChats: user.pinnedChats || [],
      mutedChats: user.mutedChats || [],
      markedUnread: user.markedUnread || [],
      chatLists: user.chatLists || [],
      privacy: user.privacy,
      blockedUsers: user.blockedUsers || [],
      twoFactor: { enabled: true },
    });
  } catch (error) {
    console.log("Error in loginWithTwoFactor", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Start setup: make a secret and hand it back (as text + otpauth link for the QR).
export const setupTwoFactor = async (req, res) => {
  try {
    const user = await withSecrets(req.user._id);
    if (user.twoFactor?.enabled) return res.status(400).json({ message: "Two-step verification is already on" });
    const secret = newSecret();
    user.twoFactor.pendingSecret = secret;
    await user.save();
    res.status(200).json({ secret, otpauthUrl: otpauthUrl(secret, user.email) });
  } catch (error) {
    console.log("Error in setupTwoFactor", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Finish setup: prove the authenticator app works by typing a code.
export const enableTwoFactor = async (req, res) => {
  try {
    if (locked(req.user._id)) return res.status(429).json({ message: LOCK_MSG });
    const user = await withSecrets(req.user._id);
    const pending = user.twoFactor?.pendingSecret;
    if (!pending) return res.status(400).json({ message: "Start setup first" });
    const step = verifyTotp(pending, req.body?.code, 0);
    if (!step) {
      recordFail(user._id);
      return res.status(400).json({ message: "That code isn't right. Check your authenticator app." });
    }
    clearFails(user._id);
    const codes = newBackupCodes();
    user.twoFactor.enabled = true;
    user.twoFactor.secret = pending;
    user.twoFactor.pendingSecret = undefined;
    user.twoFactor.lastStep = step;
    user.twoFactor.backupCodes = codes.map(hashCode);
    await user.save();
    res.status(200).json({ enabled: true, backupCodes: codes });
  } catch (error) {
    console.log("Error in enableTwoFactor", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Needs the password AND a current code (or backup code).
export const disableTwoFactor = async (req, res) => {
  try {
    if (locked(req.user._id)) return res.status(429).json({ message: LOCK_MSG });
    const { password, code } = req.body || {};
    const user = await withSecrets(req.user._id);
    if (!user.twoFactor?.enabled) return res.status(400).json({ message: "Two-step verification is already off" });
    const pwOk = typeof password === "string" && (await bcrypt.compare(password, user.password));
    if (!pwOk || !checkSecondFactor(user, code)) {
      recordFail(user._id);
      return res.status(400).json({ message: "Password or code is wrong" });
    }
    clearFails(user._id);
    user.twoFactor.enabled = false;
    user.twoFactor.secret = undefined;
    user.twoFactor.pendingSecret = undefined;
    user.twoFactor.backupCodes = undefined;
    user.twoFactor.lastStep = 0;
    await user.save();
    res.status(200).json({ enabled: false });
  } catch (error) {
    console.log("Error in disableTwoFactor", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const regenerateBackupCodes = async (req, res) => {
  try {
    if (locked(req.user._id)) return res.status(429).json({ message: LOCK_MSG });
    const user = await withSecrets(req.user._id);
    if (!user.twoFactor?.enabled) return res.status(400).json({ message: "Turn on two-step verification first" });
    const step = verifyTotp(user.twoFactor.secret, req.body?.code, user.twoFactor.lastStep || 0);
    if (!step) {
      recordFail(user._id);
      return res.status(400).json({ message: "That code isn't right." });
    }
    clearFails(user._id);
    const codes = newBackupCodes();
    user.twoFactor.lastStep = step;
    user.twoFactor.backupCodes = codes.map(hashCode);
    await user.save();
    res.status(200).json({ backupCodes: codes });
  } catch (error) {
    console.log("Error in regenerateBackupCodes", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const twoFactorStatus = async (req, res) => {
  const user = await withSecrets(req.user._id);
  res.status(200).json({ enabled: !!user?.twoFactor?.enabled, backupCodesLeft: user?.twoFactor?.backupCodes?.length || 0 });
};
