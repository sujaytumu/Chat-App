import Activity from "../models/activity.model.js";

export const listActivity = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const rows = await Activity.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).populate("actorId", "fullName profilePic").lean();
    const unread = await Activity.countDocuments({ userId: req.user._id, read: false });
    const items = rows
      .filter((a) => a.actorId)
      .map((a) => ({ _id: a._id, type: a.type, kind: a.kind, targetId: a.targetId, thumb: a.thumb, text: a.text, read: a.read, createdAt: a.createdAt, user: { _id: a.actorId._id, fullName: a.actorId.fullName, profilePic: a.actorId.profilePic } }));
    res.json({ items, unread });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unreadCount = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ unread: await Activity.countDocuments({ userId: req.user._id, read: false }) });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await Activity.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};
