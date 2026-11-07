// Forgot password: email a one-time code, check it, then set a new password.
//   1. POST /api/auth/forgot-password          { email }               -> code is emailed (if the account exists)
//   2. POST /api/auth/forgot-password/verify   { email, otp }          -> { resetToken } (valid 10 minutes, single use)
//   3. POST /api/auth/forgot-password/reset    { resetToken, newPassword }
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { sendMail, mailEnabled } from "../lib/mailer.js";
import { ownerId } from "../lib/visibility.js";
import { endOtherSessions, restoreDaysLeft } from "./auth.controller.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashOtp = (userId, otp) =>
  crypto.createHash("sha256").update(`${userId}:${otp}:${process.env.JWT_SECRET}`).digest("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const mask = (e) => `${e.slice(0, 3)}***@${e.split("@")[1] || "?"}`;

// Same lookup the login uses: trims spaces and ignores capital letters.
async function findByEmail(raw, select = "") {
  const email = raw.trim();
  if (!email) return null;
  let user = await User.findOne({ email }).select(select);
  if (!user) {
    user = await User.findOne({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select(select);
  }
  // an account deleted less than 30 days ago can still reset its password (then log in to restore it)
  return user && (!user.deleted || restoreDaysLeft(user) > 0) ? user : null;
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== "string" || !email.trim()) return res.status(400).json({ message: "Enter your email" });
    if (!mailEnabled() && process.env.NODE_ENV !== "development") {
      return res.status(503).json({ message: "Password reset email isn't set up on the server yet" });
    }

    // Same answer whether or not the account exists, so nobody can use this to find out who has an account.
    const generic = { message: "If that email has an account, a 6-digit code is on its way." };
    const user = await findByEmail(email, "+passwordReset.sentAt");
    if (!user) {
      console.log(`forgot password: no account for ${mask(email.trim())}`);
      return res.status(200).json(generic);
    }

    const sentAt = user.passwordReset?.sentAt?.getTime?.() || 0;
    if (Date.now() - sentAt < RESEND_AFTER_MS) return res.status(200).json(generic); // one email a minute

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await User.updateOne(
      { _id: user._id },
      { $set: { "passwordReset.otpHash": hashOtp(user._id, otp), "passwordReset.expiresAt": new Date(Date.now() + OTP_TTL_MS), "passwordReset.attempts": 0, "passwordReset.sentAt": new Date() } }
    );

    if (process.env.NODE_ENV === "development") console.log(`[dev] password reset code for ${mask(user.email)}: ${otp}`);
    const sent = await sendMail(
      user.email,
      `${otp} is your Talkies password reset code`,
      `Your Talkies password reset code is ${otp}.\n\nIt works for 10 minutes. If you didn't ask for this, you can ignore this email - your password has not changed.`,
      `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
         <h2 style="margin:0 0 12px">Reset your Talkies password</h2>
         <p>Use this code to choose a new password:</p>
         <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:16px 0">${otp}</p>
         <p style="color:#666;font-size:13px">It works for 10 minutes. If you didn't ask for this, ignore this email - your password has not changed.</p>
       </div>`
    );
    if (!sent && process.env.NODE_ENV !== "development") {
      await User.updateOne({ _id: user._id }, { $unset: { "passwordReset.otpHash": "", "passwordReset.expiresAt": "", "passwordReset.sentAt": "" } });
      return res.status(502).json({ message: "Couldn't send the email. Try again in a minute." });
    }
    res.status(200).json(generic);
  } catch (error) {
    console.log("Error in forgotPassword controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyResetCode = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (typeof email !== "string" || typeof otp !== "string") return res.status(400).json({ message: "Invalid input" });
    const code = otp.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code" });

    const user = await findByEmail(email, "+passwordReset.otpHash +passwordReset.expiresAt +passwordReset.attempts");
    const pr = user?.passwordReset;
    if (!user || !pr?.otpHash || !pr.expiresAt || pr.expiresAt < new Date()) {
      return res.status(400).json({ message: "That code is wrong or has expired. Request a new one." });
    }
    if ((pr.attempts || 0) >= MAX_ATTEMPTS) {
      await User.updateOne({ _id: user._id }, { $unset: { "passwordReset.otpHash": "", "passwordReset.expiresAt": "" } });
      return res.status(400).json({ message: "Too many wrong codes. Request a new one." });
    }

    if (!same(pr.otpHash, hashOtp(user._id, code))) {
      await User.updateOne({ _id: user._id }, { $inc: { "passwordReset.attempts": 1 } });
      return res.status(400).json({ message: "That code is wrong or has expired. Request a new one." });
    }

    const resetToken = jwt.sign({ userId: user._id, purpose: "pwreset", rv: pr.otpHash.slice(0, 16) }, process.env.JWT_SECRET, { expiresIn: "10m" });
    res.status(200).json({ resetToken });
  } catch (error) {
    console.log("Error in verifyResetCode controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {};
    if (typeof resetToken !== "string" || typeof newPassword !== "string") return res.status(400).json({ message: "Invalid input" });
    if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "This reset timed out. Start again." });
    }
    if (payload?.purpose !== "pwreset") return res.status(400).json({ message: "This reset timed out. Start again." });

    const user = await User.findById(payload.userId).select("+passwordReset.otpHash");
    // The token only works while the code it was issued for is still pending, so it can be used once.
    if (!user || (user.deleted && restoreDaysLeft(user) <= 0) || !user.passwordReset?.otpHash || user.passwordReset.otpHash.slice(0, 16) !== payload.rv) {
      return res.status(400).json({ message: "This reset timed out. Start again." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // every device signs in again with the new password
    user.passwordReset = undefined;
    await user.save();
    endOtherSessions(user._id);

    console.log(`password reset done for ${mask(user.email)}`);
    res.status(200).json({ message: "Password changed. Sign in with your new password." });
  } catch (error) {
    console.log("Error in resetPassword controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Owner break-glass ──────────────────────────────────────────────────────────────────────────────
// If the owner forgets the password AND cannot open the email, the secret OWNER_RECOVERY_KEY (kept only in the
// hosting settings) sets a new password for the OWNER account. Nobody else's account can be reached this way,
// and the endpoint is closed completely until the key is set. Wrong guesses are limited per address.
const recoveryTries = new Map(); // ip -> { n, until }
const sameSecret = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
export const ownerRecovery = async (req, res) => {
  try {
    const secret = process.env.OWNER_RECOVERY_KEY || "";
    if (secret.length < 20) return res.status(404).json({ message: "Owner recovery is not set up" });
    const ip = req.ip || "x";
    const t = recoveryTries.get(ip);
    if (t && t.until > Date.now() && t.n >= 5) return res.status(429).json({ message: "Too many wrong keys. Try again in 15 minutes." });
    const { key, newPassword } = req.body || {};
    if (typeof key !== "string" || typeof newPassword !== "string") return res.status(400).json({ message: "Enter the recovery key and a new password" });
    if (newPassword.length < 8 || newPassword.length > 200) return res.status(400).json({ message: "Password must be at least 8 characters" });
    if (!sameSecret(key.trim(), secret)) {
      const cur = t && t.until > Date.now() ? t : { n: 0, until: Date.now() + 15 * 60 * 1000 };
      cur.n += 1;
      recoveryTries.set(ip, cur);
      console.log(`owner recovery: wrong key (${cur.n}/5)`);
      return res.status(400).json({ message: "That recovery key did not work" });
    }
    const id = await ownerId();
    const owner = id ? await User.findById(id) : null;
    if (!owner) return res.status(404).json({ message: "Owner account not found" });
    owner.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    owner.tokenVersion = (owner.tokenVersion || 0) + 1;
    owner.passwordReset = undefined;
    await owner.save();
    endOtherSessions(owner._id);
    recoveryTries.delete(ip);
    console.log("owner recovery: owner password was reset with the recovery key");
    res.json({ message: "Password changed" });
  } catch (e) {
    console.log("ownerRecovery:", e.message);
    res.status(500).json({ message: "Couldn't change the password" });
  }
};
