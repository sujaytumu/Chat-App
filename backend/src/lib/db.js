import mongoose from "mongoose";
import Message from "../models/message.model.js";
import Status from "../models/status.model.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
    // Start-up housekeeping runs in the background a little later, so the first requests after a (cold) start
    // don't queue behind it. The call-log sweep scans every message, so it runs ONCE (a marker row remembers).
    setTimeout(() => {
      runOnce("cleanup-call-log-messages", cleanupCallLogMessages).catch(() => {});
      keepExpiredStatuses().catch(() => {});
      // Repeated reels (same file, same size and length, or same thumbnail) that were posted before the check existed:
      // the oldest copy stays. Runs once.
      runOnce("dedupe-reels-v1", async () => (await import("../controllers/reel.controller.js")).dedupeReels()).catch(() => {});
    }, 45000);
  } catch (error) {
    console.log("MongoDB connection error:", error);
  }
};

async function runOnce(id, fn) {
  const col = mongoose.connection.db.collection("maintenance");
  try {
    await col.insertOne({ _id: id, at: new Date() }); // fails if it already ran
  } catch {
    return;
  }
  await fn();
}

// Permanently removing the inline "Voice call · No answer" chat-bubble
// feature (it kept resurfacing clutter even after reliability fixes to the
// calling flow — calls are tracked in the separate Calls tab instead).
// Sweeps up any leftover entries already created. Safe on every startup —
// a no-op once they're gone.
async function cleanupCallLogMessages() {
  try {
    const result = await Message.deleteMany({ callInfo: { $exists: true } });
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} leftover call-log chat message(s).`);
    }
  } catch (error) {
    console.log("Error cleaning up call-log messages:", error.message);
  }
}

// Statuses are kept forever now (history + highlights). Older deployments created a TTL index on
// `expiresAt` that makes MongoDB delete each status 24h after posting — drop it, keep a plain index.
// Safe on every startup: a no-op once the TTL index is gone.
async function keepExpiredStatuses() {
  try {
    const indexes = await Status.collection.indexes().catch(() => []);
    const ttl = indexes.find((i) => i.key && i.key.expiresAt === 1 && typeof i.expireAfterSeconds === "number");
    if (ttl) {
      await Status.collection.dropIndex(ttl.name);
      console.log("Dropped the status TTL index: statuses are kept now.");
    }
    await Status.collection.createIndex({ expiresAt: 1 }).catch(() => {});
    await Status.collection.createIndex({ userId: 1, createdAt: -1 }).catch(() => {});
  } catch (error) {
    console.log("Error keeping expired statuses:", error.message);
  }
}
