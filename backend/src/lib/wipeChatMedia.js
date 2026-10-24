import mongoose from "mongoose";
import cloudinary from "./cloudinary.js";
import Message from "../models/message.model.js";

// ONE-TIME clean-up requested by the owner: remove every photo / video / document / voice note that was
// sent in chats BEFORE media became private. Runs once (a marker row stops it from ever running again).
// Only chat media is touched: profile pictures, group pictures and statuses are left alone.
const MARKER_ID = "wipe-chat-media-2026-10-20";
const PREFIXES = ["chat-app/messages/", "chat-app/files/"];

async function deleteFromCloudinary() {
  let removed = 0;
  for (const prefix of PREFIXES) {
    for (const resource_type of ["image", "video", "raw"]) {
      for (const type of ["upload", "authenticated"]) {
        let cursor;
        do {
          const r = await cloudinary.api.delete_resources_by_prefix(prefix, { resource_type, type, ...(cursor ? { next_cursor: cursor } : {}) });
          removed += Object.values(r.deleted || {}).filter((v) => v === "deleted").length;
          cursor = r.partial ? r.next_cursor : null;
        } while (cursor);
      }
    }
  }
  return removed;
}

export async function wipeChatMediaOnce() {
  const col = mongoose.connection.db.collection("maintenance");
  try {
    await col.insertOne({ _id: MARKER_ID, startedAt: new Date() }); // fails if it already ran
  } catch {
    return; // already done (or running on another instance)
  }
  try {
    console.log("[wipe-chat-media] starting");
    const removedFiles = await deleteFromCloudinary();
    const mediaFilter = { $or: [{ image: { $nin: ["", null] } }, { "file.url": { $nin: ["", null] } }, { viewOnceUrl: { $exists: true } }] };
    // a bubble that was only a picture / file has nothing left to show: remove it entirely
    const gone = await Message.deleteMany({ $and: [mediaFilter, { $or: [{ text: "" }, { text: null }] }, { poll: { $exists: false } }, { contact: { $exists: false } }] });
    // a bubble with a caption keeps its words, minus the attachment
    const kept = await Message.collection.updateMany(mediaFilter, { $set: { image: "", viewOnce: false }, $unset: { file: "", viewOnceUrl: "" } });
    await col.updateOne({ _id: MARKER_ID }, { $set: { finishedAt: new Date(), removedFiles, deletedMessages: gone.deletedCount, strippedMessages: kept.modifiedCount } });
    console.log(`[wipe-chat-media] done: ${removedFiles} files removed, ${gone.deletedCount} media-only messages deleted, ${kept.modifiedCount} captions kept`);
  } catch (e) {
    console.log("[wipe-chat-media] failed, will retry on next start:", e.message);
    await col.deleteOne({ _id: MARKER_ID }).catch(() => {});
  }
}
