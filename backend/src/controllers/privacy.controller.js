import User from "../models/user.model.js";
import { KINDS, cleanAudience } from "../lib/audience.js";

const present = (cp = {}) => Object.fromEntries(KINDS.map((k) => [k, { mode: cp?.[k]?.mode || "all", users: (cp?.[k]?.users || []).map(String) }]));

// The default "who can see" for my status, highlights, reels and posts
export const getContentPrivacy = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const u = await User.findById(req.user._id).select("contentPrivacy").lean();
    res.json(present(u?.contentPrivacy));
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setContentPrivacy = async (req, res) => {
  try {
    const { kind, audience } = req.body || {};
    if (!KINDS.includes(kind)) return res.status(400).json({ error: "Unknown kind" });
    if (audience?.mode === "only" && !(Array.isArray(audience.users) && audience.users.length)) return res.status(400).json({ error: "Pick at least one person" });
    const clean = cleanAudience(audience, req.user._id);
    if (!clean) return res.status(400).json({ error: "Bad audience" });
    await User.updateOne({ _id: req.user._id }, { $set: { [`contentPrivacy.${kind}`]: clean } });
    const u = await User.findById(req.user._id).select("contentPrivacy").lean();
    res.json(present(u?.contentPrivacy));
  } catch (e) {
    console.log("setContentPrivacy:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
