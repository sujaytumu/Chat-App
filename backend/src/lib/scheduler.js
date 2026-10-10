import ScheduledMessage from "../models/scheduledMessage.model.js";
import User from "../models/user.model.js";
import { sendMessage } from "../controllers/message.controller.js";
import { sendGroupMessage } from "../controllers/group.controller.js";

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

async function tick() {
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
