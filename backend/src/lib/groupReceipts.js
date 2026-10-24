import Message from "../models/message.model.js";

// Group receipts, WhatsApp style: every member's "delivered" and "read" is
// recorded with a time, and the group is told so the sender's ticks update live.
// `io` is passed in (not imported) to avoid a circular import with socket.js.

const MAX_BATCH = 500;

// A member's device got these messages. Either pass groupIds (everything still
// undelivered to them in those groups, e.g. when they come online) or messageIds.
export async function markGroupDelivered(io, userId, { groupIds, messageIds } = {}) {
  try {
    const filter = {
      senderId: { $ne: userId },
      "deliveredTo.user": { $ne: userId },
      groupId: groupIds ? { $in: groupIds } : { $ne: null },
    };
    if (messageIds) filter._id = { $in: messageIds };
    const pending = await Message.find(filter).sort({ createdAt: -1 }).limit(MAX_BATCH).select("_id groupId").lean();
    if (pending.length === 0) return;

    const at = new Date();
    await Message.updateMany(
      { _id: { $in: pending.map((m) => m._id) } },
      { $push: { deliveredTo: { user: userId, at } } }
    );
    emitByGroup(io, pending, { userId: String(userId), at, kind: "delivered" });
  } catch (err) {
    console.log("Error recording group delivery:", err.message);
  }
}

// A member opened the group and read what is in it.
export async function markGroupSeen(io, groupId, userId) {
  try {
    const unseen = await Message.find({ groupId, senderId: { $ne: userId }, seenBy: { $ne: userId } })
      .select("_id groupId deliveredTo")
      .lean();
    if (unseen.length === 0) return;

    const at = new Date();
    const ids = unseen.map((m) => m._id);
    await Message.updateMany(
      { _id: { $in: ids } },
      { $addToSet: { seenBy: userId }, $push: { seenLog: { user: userId, at } } }
    );
    // Reading implies it was delivered
    const notDelivered = unseen
      .filter((m) => !(m.deliveredTo || []).some((d) => String(d.user) === String(userId)))
      .map((m) => m._id);
    if (notDelivered.length) {
      await Message.updateMany({ _id: { $in: notDelivered } }, { $push: { deliveredTo: { user: userId, at } } });
    }
    emitByGroup(io, unseen, { userId: String(userId), at, kind: "seen" });
  } catch (err) {
    console.log("Error recording group read receipts:", err.message);
  }
}

function emitByGroup(io, messages, { userId, at, kind }) {
  const byGroup = new Map();
  messages.forEach((m) => {
    const g = String(m.groupId);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(String(m._id));
  });
  byGroup.forEach((ids, groupId) => {
    io.to(groupId).emit("groupReceipts", { groupId, userId, at, kind, messageIds: ids });
  });
}
