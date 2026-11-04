import mongoose from "mongoose";
import ScheduledMessage from "../models/scheduledMessage.model.js";
import Group from "../models/group.model.js";

const MIN_AHEAD_MS = 30 * 1000;
const MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;
const MAX_PENDING = 50;

const chatFilter = (chatType, chatId) =>
  chatType === "group" ? { groupId: chatId } : { groupId: null, receiverId: chatId };

export const scheduleMessage = async (req, res) => {
  try {
    const { chatType, chatId } = req.body;
    const text = String(req.body.text || "").trim().slice(0, 2000);
    const sendAt = new Date(req.body.sendAt);
    const myId = req.user._id;

    if (!["direct", "group"].includes(chatType) || !mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ error: "Invalid chat" });
    }
    if (!text) return res.status(400).json({ error: "Write a message first" });
    const ahead = sendAt.getTime() - Date.now();
    if (Number.isNaN(ahead) || ahead < MIN_AHEAD_MS) return res.status(400).json({ error: "Pick a time in the future" });
    if (ahead > MAX_AHEAD_MS) return res.status(400).json({ error: "That's too far ahead (1 year max)" });
    if (chatType === "group" && !(await Group.exists({ _id: chatId, members: myId }))) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }
    if ((await ScheduledMessage.countDocuments({ senderId: myId })) >= MAX_PENDING) {
      return res.status(400).json({ error: "You have too many scheduled messages" });
    }
    const doc = await ScheduledMessage.create({
      senderId: myId,
      ...(chatType === "group" ? { groupId: chatId } : { receiverId: chatId }),
      text,
      sendAt,
    });
    res.status(201).json(doc);
  } catch (error) {
    console.log("Error in scheduleMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listScheduled = async (req, res) => {
  try {
    const { chatType, chatId } = req.query;
    const q = { senderId: req.user._id };
    if (chatType && mongoose.isValidObjectId(chatId)) Object.assign(q, chatFilter(chatType, chatId));
    res.status(200).json(await ScheduledMessage.find(q).sort({ sendAt: 1 }).limit(100).lean());
  } catch (error) {
    console.log("Error in listScheduled controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const cancelScheduled = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    await ScheduledMessage.deleteOne({ _id: req.params.id, senderId: req.user._id });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in cancelScheduled controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
