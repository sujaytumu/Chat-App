import Message from "../models/message.model.js";

// Delivery receipts for direct chats are cumulative, like WhatsApp: once a device
// has received (or opened) something from a person, every earlier message from
// them to this user has reached it too. Flips them to "delivered" and tells the
// senders. `emitTo(userId, event, payload)` is passed in to avoid import cycles.
export async function markDirectDeliveredFor(emitTo, receiverId, extra = {}) {
  try {
    const filter = { receiverId, groupId: null, delivered: false, ...extra };
    const pending = await Message.find(filter).select("_id senderId").lean();
    if (!pending.length) return;
    await Message.updateMany({ _id: { $in: pending.map((m) => m._id) } }, { $set: { delivered: true, deliveredAt: new Date() } });
    const senders = [...new Set(pending.map((m) => String(m.senderId)))];
    senders.forEach((sid) => emitTo(sid, "messagesDelivered", { by: String(receiverId) }));
  } catch (e) {
    console.log("Error in markDirectDeliveredFor:", e.message);
  }
}

// One specific message reached the device: it and everything earlier from that sender.
export async function ackDirectMessage(emitTo, receiverId, messageId) {
  const m = await Message.findOne({ _id: messageId, receiverId, groupId: null }).select("senderId createdAt").lean();
  if (!m) return false;
  await markDirectDeliveredFor(emitTo, receiverId, { senderId: m.senderId, createdAt: { $lte: m.createdAt } });
  return true;
}
