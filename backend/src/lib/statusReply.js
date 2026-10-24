import mongoose from "mongoose";
import Status from "../models/status.model.js";
import Highlight from "../models/highlight.model.js";

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

// Same quote, for an answer to an item of someone's highlight. Only if the replier could see that item.
export async function buildHighlightReply(highlightId, itemId, ownerId, viewerId) {
  if (!mongoose.isValidObjectId(highlightId) || !mongoose.isValidObjectId(itemId)) return null;
  const h = await Highlight.findOne({ _id: highlightId, userId: ownerId }).select("items").lean();
  const it = h?.items?.find((x) => String(x._id) === String(itemId));
  if (!it) return null;
  const a = it.audience;
  if (a?.mode && a.mode !== "all") {
    const listed = (a.users || []).some((u) => String(u) === String(viewerId));
    if (a.mode === "only" ? !listed : listed) return null;
  }
  return {
    kind: it.type,
    preview: it.type === "text" ? String(it.content).slice(0, 120) : it.type === "image" ? it.content : String(it.caption || "").slice(0, 120),
    color: it.type === "text" ? it.backgroundColor : "",
  };
}
