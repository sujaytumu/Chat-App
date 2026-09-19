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
