import mongoose from "mongoose";
import Broadcast from "../models/broadcast.model.js";
import User from "../models/user.model.js";

const MAX_LISTS = 50;
const MAX_MEMBERS = 256;

// Keep only valid, unique contact ids (never yourself) that really exist.
const cleanMembers = async (raw, myId) => {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(String))].filter(
    (id) => mongoose.isValidObjectId(id) && id !== String(myId)
  );
  if (!ids.length) return [];
  const found = await User.find({ _id: { $in: ids.slice(0, MAX_MEMBERS) } }).select("_id");
  return found.map((u) => u._id);
};

export const listBroadcasts = async (req, res) => {
  try {
    const lists = await Broadcast.find({ ownerId: req.user._id }).sort({ updatedAt: -1 }).limit(MAX_LISTS);
    res.status(200).json(lists);
  } catch (error) {
    console.log("Error in listBroadcasts controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createBroadcast = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 50);
    if (!name) return res.status(400).json({ error: "Give the list a name" });
    const memberIds = await cleanMembers(req.body.memberIds, req.user._id);
    if (!memberIds.length) return res.status(400).json({ error: "Pick at least one contact" });
    if ((await Broadcast.countDocuments({ ownerId: req.user._id })) >= MAX_LISTS) {
      return res.status(400).json({ error: "You have too many broadcast lists" });
    }
    const doc = await Broadcast.create({ ownerId: req.user._id, name, memberIds });
    res.status(201).json(doc);
  } catch (error) {
    console.log("Error in createBroadcast controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateBroadcast = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid list" });
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim().slice(0, 50);
      if (!name) return res.status(400).json({ error: "Give the list a name" });
      update.name = name;
    }
    if (req.body.memberIds !== undefined) {
      const memberIds = await cleanMembers(req.body.memberIds, req.user._id);
      if (!memberIds.length) return res.status(400).json({ error: "Pick at least one contact" });
      update.memberIds = memberIds;
    }
    const doc = await Broadcast.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user._id },
      { $set: update },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "List not found" });
    res.status(200).json(doc);
  } catch (error) {
    console.log("Error in updateBroadcast controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteBroadcast = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid list" });
    await Broadcast.deleteOne({ _id: req.params.id, ownerId: req.user._id });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in deleteBroadcast controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
