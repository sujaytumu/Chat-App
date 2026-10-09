import Status from "../models/status.model.js";
import cloudinary from "../lib/cloudinary.js";
import { uploadFileAttachment } from "../lib/uploadFile.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const MAX_MEDIA_BASE64 = 13 * 1024 * 1024;
const MAX_SONG_BASE64 = 6 * 1024 * 1024;

export const createStatus = async (req, res) => {
  try {
    const { type, content, backgroundColor, caption, file, song, location } = req.body;
    const myId = req.user._id;

    if (!["text", "image", "video", "audio", "file"].includes(type) || !content) {
      return res.status(400).json({ error: "Status needs a type and content" });
    }
    if (type !== "text" && typeof content === "string" && content.length > MAX_MEDIA_BASE64) {
      return res.status(413).json({ error: "That file is too large for a status" });
    }

    const doc = {
      userId: myId,
      type,
      backgroundColor: backgroundColor || "#00A884",
      caption: typeof caption === "string" ? caption.trim().slice(0, 700) : "",
      expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS),
    };

    if (type === "text") {
      doc.content = String(content).slice(0, 700);
    } else if (type === "image") {
      const uploadResponse = await cloudinary.uploader.upload(content, { folder: "chat-app/status", resource_type: "image" });
      doc.content = uploadResponse.secure_url;
    } else {
      const mime = type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : "application/octet-stream";
      const uploaded = await uploadFileAttachment({
        data: content,
        name: file?.name,
        mimeType: file?.mime || mime,
        size: file?.size,
        duration: file?.duration,
      });
      doc.content = uploaded.url;
      doc.file = { name: uploaded.name, size: uploaded.size, mime: file?.mime || mime };
    }

    if (song?.data) {
      if (song.data.length > MAX_SONG_BASE64) return res.status(413).json({ error: "That song is too large" });
      const uploaded = await uploadFileAttachment({ data: song.data, name: song.name, mimeType: "audio/mpeg", size: song.size });
      doc.song = { url: uploaded.url, name: String(song.name || "Song").slice(0, 80) };
    }

    if (location && typeof location.name === "string" && location.name.trim()) {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      doc.location = {
        name: location.name.trim().slice(0, 100),
        ...(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}),
      };
    }

    const status = await Status.create(doc);
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

    const myDocs = byUser.get(myId.toString())?.statuses || [];
    byUser.delete(myId.toString());
    // Only the owner sees who viewed their status.
    await Status.populate(myDocs, { path: "views.user", select: "fullName profilePic" });
    const myStatuses = myDocs.map((d) => d.toObject());

    const others = Array.from(byUser.values()).map((entry) => ({
      user: entry.user,
      hasUnseen: entry.statuses.some((s) => !s.viewedBy.some((v) => v.equals(myId))),
      statuses: entry.statuses.map((s) => {
        const o = s.toObject();
        o.seen = s.viewedBy.some((v) => v.equals(myId));
        delete o.viewedBy;
        delete o.views;
        return o;
      }),
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

    await Status.updateOne(
      { _id: id, userId: { $ne: myId }, viewedBy: { $ne: myId } },
      { $push: { viewedBy: myId, views: { user: myId, at: new Date() } } }
    );

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
