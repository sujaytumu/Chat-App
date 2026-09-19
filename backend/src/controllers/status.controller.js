import Status from "../models/status.model.js";
import cloudinary from "../lib/cloudinary.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const createStatus = async (req, res) => {
  try {
    const { type, content, backgroundColor } = req.body;
    const myId = req.user._id;

    if (!type || !content) {
      return res.status(400).json({ error: "Status needs a type and content" });
    }

    let finalContent = content;
    if (type === "image") {
      const uploadResponse = await cloudinary.uploader.upload(content, {
        folder: "chat-app/status",
        resource_type: "image",
      });
      finalContent = uploadResponse.secure_url;
    }

    const status = await Status.create({
      userId: myId,
      type,
      content: finalContent,
      backgroundColor: backgroundColor || "#00A884",
      expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS),
    });

    res.status(201).json(status);
  } catch (error) {
    console.log("Error in createStatus controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Grouped by user: everyone (besides me) who currently has at least one
// active (non-expired — the TTL index handles actual deletion) status.
export const getStatusFeed = async (req, res) => {
  try {
    const myId = req.user._id;

    const statuses = await Status.find({ expiresAt: { $gt: new Date() } })
      .populate("userId", "fullName profilePic")
      .sort({ createdAt: 1 });

    const byUser = new Map();
    for (const s of statuses) {
      const uid = s.userId._id.toString();
      if (!byUser.has(uid)) byUser.set(uid, { user: s.userId, statuses: [] });
      byUser.get(uid).statuses.push(s);
    }

    const myStatuses = byUser.get(myId.toString())?.statuses || [];
    byUser.delete(myId.toString());

    const others = Array.from(byUser.values()).map((entry) => ({
      ...entry,
      hasUnseen: entry.statuses.some((s) => !s.viewedBy.some((v) => v.equals(myId))),
    }));

    res.status(200).json({ myStatuses, others });
  } catch (error) {
    console.log("Error in getStatusFeed controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markStatusViewed = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;

    await Status.updateOne({ _id: id, viewedBy: { $ne: myId } }, { $push: { viewedBy: myId } });

    res.status(200).json({ message: "Marked as viewed" });
  } catch (error) {
    console.log("Error in markStatusViewed controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;

    const status = await Status.findById(id);
    if (!status) return res.status(404).json({ error: "Status not found" });
    if (!status.userId.equals(myId)) {
      return res.status(403).json({ error: "You can only delete your own status" });
    }

    await Status.findByIdAndDelete(id);
    res.status(200).json({ message: "Status deleted" });
  } catch (error) {
    console.log("Error in deleteStatus controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
