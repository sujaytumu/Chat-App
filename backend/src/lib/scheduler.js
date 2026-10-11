import ScheduledMessage from "../models/scheduledMessage.model.js";
import User from "../models/user.model.js";
import { sendMessage } from "../controllers/message.controller.js";
import { sendGroupMessage } from "../controllers/group.controller.js";
import { io } from "./socket.js";

// Every few seconds: send whatever has come due, through the normal send code
// (so ticks, push notifications, blocking and disappearing timers all behave).
const fakeRes = () => {
  const r = { statusCode: 200 };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = () => r;
  return r;
};

// Timed mutes that have run out: un-mute those chats and tell the person's devices.
async function endExpiredMutes() {
  const now = new Date();
  const users = await User.find({ "mutedUntil.until": { $lte: now } }).select("mutedUntil").limit(50).lean();
  for (const u of users) {
    const keys = u.mutedUntil.filter((m) => m.until <= now).map((m) => m.key);
    if (!keys.length) continue;
    const updated = await User.findByIdAndUpdate(
      u._id,
      { $pull: { mutedChats: { $in: keys }, mutedUntil: { key: { $in: keys } } } },
      { new: true }
    ).select("mutedChats");
    io.to(String(u._id)).emit("mutedChats", updated?.mutedChats || []);
  }
}

async function tick() {
  await endExpiredMutes().catch((e) => console.log("Mute expiry error:", e.message));
  const due = await ScheduledMessage.find({ sendAt: { $lte: new Date() } }).sort({ sendAt: 1 }).limit(30).lean();
  for (const item of due) {
    // claim it first so it can never be sent twice
    const claimed = await ScheduledMessage.findOneAndDelete({ _id: item._id });
    if (!claimed) continue;
    try {
      const user = await User.findById(item.senderId).select("-password");
      if (!user) continue;
      const req = { user, body: { text: item.text }, params: { id: String(item.groupId || item.receiverId) } };
      await (item.groupId ? sendGroupMessage(req, fakeRes()) : sendMessage(req, fakeRes()));
    } catch (e) {
      console.log("Scheduled send failed:", e.message);
    }
  }
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.log("Scheduler error:", e.message)), 15000);
}
