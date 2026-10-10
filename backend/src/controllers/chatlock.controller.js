import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { io } from "../lib/socket.js";

// Chat lock: the person sets a 4-6 digit PIN, then can lock any chat. Locked
// chats are hidden from the chat list, search and notification previews until
// the PIN is entered. The PIN is stored only as a bcrypt hash.
const PIN_RX = /^\d{4,6}$/;
const pinOk = (v) => typeof v === "string" && PIN_RX.test(v);

const getHash = async (userId) => (await User.findById(userId).select("chatLockPin").lean())?.chatLockPin || "";

export const lockStatus = async (req, res) => {
  try {
    res.status(200).json({ hasPin: !!(await getHash(req.user._id)) });
  } catch (error) {
    console.log("Error in lockStatus controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create the PIN, or change it (needs the current PIN).
export const setLockPin = async (req, res) => {
  try {
    const { pin, currentPin } = req.body || {};
    if (!pinOk(pin)) return res.status(400).json({ error: "PIN must be 4 to 6 digits" });
    const hash = await getHash(req.user._id);
    if (hash && !(pinOk(currentPin) && (await bcrypt.compare(currentPin, hash)))) {
      return res.status(401).json({ error: "Current PIN is wrong" });
    }
    await User.updateOne({ _id: req.user._id }, { chatLockPin: await bcrypt.hash(pin, 10) });
    res.status(200).json({ hasPin: true });
  } catch (error) {
    console.log("Error in setLockPin controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const verifyLockPin = async (req, res) => {
  try {
    const { pin } = req.body || {};
    const hash = await getHash(req.user._id);
    if (!hash) return res.status(400).json({ error: "No PIN set" });
    if (!pinOk(pin) || !(await bcrypt.compare(pin, hash))) return res.status(401).json({ error: "Wrong PIN" });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in verifyLockPin controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Lock / unlock one chat. Locking needs a PIN to exist; unlocking needs the PIN.
export const setChatLocked = async (req, res) => {
  try {
    const { chatType, chatId, locked, pin } = req.body || {};
    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    const hash = await getHash(req.user._id);
    if (!hash) return res.status(400).json({ error: "Set a PIN first" });
    if (!locked && !(pinOk(pin) && (await bcrypt.compare(pin, hash)))) {
      return res.status(401).json({ error: "Wrong PIN" });
    }
    const key = `${chatType === "group" ? "g" : "d"}:${chatId}`;
    const update = locked ? { $addToSet: { lockedChats: key } } : { $pull: { lockedChats: key } };
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("lockedChats");
    const lockedChats = user?.lockedChats || [];
    io.to(req.user._id.toString()).emit("lockedChats", lockedChats);
    res.status(200).json({ lockedChats });
  } catch (error) {
    console.log("Error in setChatLocked controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Forgot the PIN: the account password removes it and unlocks every chat.
export const resetChatLock = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== "string") return res.status(400).json({ error: "Enter your account password" });
    const user = await User.findById(req.user._id).select("password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Wrong password" });
    }
    await User.updateOne({ _id: req.user._id }, { $set: { lockedChats: [] }, $unset: { chatLockPin: 1 } });
    io.to(req.user._id.toString()).emit("lockedChats", []);
    res.status(200).json({ lockedChats: [], hasPin: false });
  } catch (error) {
    console.log("Error in resetChatLock controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
