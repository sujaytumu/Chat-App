import mongoose from "mongoose";
import Status from "../models/status.model.js";

// When someone answers a status, the message carries a small quote of it.
// Built here from the real status (never trusted from the client).
export async function buildStatusReply(statusId, ownerId) {
  if (!statusId || !mongoose.isValidObjectId(statusId)) return null;
  const s = await Status.findById(statusId).select("userId type content caption backgroundColor expiresAt").lean();
  if (!s || String(s.userId) !== String(ownerId) || s.expiresAt <= new Date()) return null;
  return {
    kind: s.type,
    preview: s.type === "text" ? String(s.content).slice(0, 120) : s.type === "image" ? s.content : String(s.caption || "").slice(0, 120),
    color: s.type === "text" ? s.backgroundColor : "",
  };
}
