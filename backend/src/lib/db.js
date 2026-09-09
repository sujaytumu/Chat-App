import mongoose from "mongoose";
import Message from "../models/message.model.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
    await cleanupCallLogMessages();
  } catch (error) {
    console.log("MongoDB connection error:", error);
  }
};

// One-time cleanup: an earlier version briefly posted "Voice call · No
// answer" style entries directly into chat threads, which cluttered real
// conversations. That behavior has been removed; this just sweeps up the
// leftover entries it already created. Safe to run on every startup — it's
// a no-op once they're gone (matches nothing, deletes nothing).
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
