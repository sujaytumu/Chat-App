import ScheduledMessage from "../models/scheduledMessage.model.js";
import User from "../models/user.model.js";
import { sendMessage } from "../controllers/message.controller.js";
import { sendGroupMessage } from "../controllers/group.controller.js";
import { io } from "./socket.js";
import CallLink from "../models/callLink.model.js";
import { sendPushToUsers, sendPushToUser } from "./webPush.js";
import Reminder from "../models/reminder.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { purgeExpiredAccounts } from "../controllers/auth.controller.js";
import { destroyPrivateAsset, VIEW_ONCE_TTL_MS } from "./privateMedia.js";
import { birthdayPushes } from "./birthdayPush.js";
import { nextAfterNow } from "./recurrence.js";

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

// Scheduled calls: a reminder 10 minutes before and another when it is time.
async function callReminders() {
  const now = new Date();
  const soon = await CallLink.find({ scheduledFor: { $gt: now, $lte: new Date(now.getTime() + 10 * 60000) }, remindedSoon: false }).limit(20);
  for (const l of soon) {
    const claimed = await CallLink.findOneAndUpdate({ _id: l._id, remindedSoon: false }, { remindedSoon: true });
    if (!claimed) continue;
    const mins = Math.max(1, Math.round((l.scheduledFor - now) / 60000));
    sendPushToUsers([l.creatorId, ...l.invitees], {
      title: l.title || "Scheduled call",
      body: `Starts in ${mins} minute${mins === 1 ? "" : "s"}`,
      icon: "/icon-v2-192.png",
      tag: `call-link-${l.code}`,
      data: { url: `/call/${l.code}`, callCode: l.code },
    });
  }
  const start = await CallLink.find({ scheduledFor: { $lte: now, $gt: new Date(now.getTime() - 30 * 60000) }, remindedStart: false }).limit(20);
  for (const l of start) {
    const claimed = await CallLink.findOneAndUpdate({ _id: l._id, remindedStart: false }, { remindedStart: true });
    if (!claimed) continue;
    sendPushToUsers([l.creatorId, ...l.invitees], {
      title: l.title || "Scheduled call",
      body: "Time to join your call",
      icon: "/icon-v2-192.png",
      tag: `call-link-${l.code}`,
      data: { url: `/call/${l.code}`, callCode: l.code },
    });

  }
}

// A repeating call keeps its date while people can still join it (30 minutes after it starts), then moves on to its
// next date - same link - until its one year is over.
async function rollRepeatingCalls() {
  const done = await CallLink.find({ repeat: { $ne: "none" }, remindedStart: true, scheduledFor: { $lte: new Date(Date.now() - 30 * 60000) } }).limit(20).lean();
  for (const l of done) {
    const nx = nextAfterNow(+new Date(l.firstAt || l.scheduledFor), l.occurrence || 0, l.repeat, l.tz || "UTC", l.repeatUntil);
    if (!nx) continue; // its year is over: it simply ends (the link expires with it)
    await CallLink.updateOne({ _id: l._id, scheduledFor: l.scheduledFor }, { $set: { scheduledFor: nx.next, occurrence: nx.n, remindedSoon: false, remindedStart: false } });
  }
}

// "Remind me about this message" that have come due: push + a live event for open apps.
async function messageReminders() {
  const due = await Reminder.find({ remindAt: { $lte: new Date() } }).sort({ remindAt: 1 }).limit(50).lean();
  for (const r of due) {
    const claimed = await Reminder.findOneAndDelete({ _id: r._id });
    if (!claimed) continue;
    let title = "Reminder";
    if (r.ifNoReply) {
      // Follow-up nudge: only when nobody has answered since my message (and it still exists).
      const sent = await Message.findById(r.messageId).select("deletedForEveryone createdAt").lean();
      if (!sent || sent.deletedForEveryone) continue;
      const since = r.msgAt || sent.createdAt;
      const answered = await Message.exists(
        r.chatType === "group"
          ? { groupId: r.chatId, senderId: { $ne: r.userId }, createdAt: { $gt: since }, system: { $exists: false }, deletedForEveryone: { $ne: true } }
          : { senderId: r.chatId, receiverId: r.userId, createdAt: { $gt: since }, system: { $exists: false }, deletedForEveryone: { $ne: true } }
      );
      if (answered) continue;
      const who =
        r.chatType === "group"
          ? (await Group.findById(r.chatId).select("name").lean())?.name
          : (await User.findById(r.chatId).select("fullName").lean())?.fullName;
      title = who ? `No reply yet from ${who}` : "No reply yet";
    }
    io.to(String(r.userId)).emit("reminderDue", { _id: r._id, messageId: r.messageId, chatType: r.chatType, chatId: r.chatId, preview: r.preview, followUp: !!r.ifNoReply });
    sendPushToUser(r.userId, {
      title,
      body: r.preview || "You asked to be reminded about a message",
      icon: "/icon-v2-192.png",
      tag: `reminder-${r._id}`,
      data: { url: "/" },
    });
  }
}

// View-once photos nobody opened within 14 days: delete the hidden file so it doesn't sit there forever.
let lastViewOncePurge = 0;
async function purgeExpiredViewOnce() {
  if (Date.now() - lastViewOncePurge < 30 * 60 * 1000) return;
  lastViewOncePurge = Date.now();
  const stale = await Message.find({ viewOnce: true, viewOnceOpened: false, createdAt: { $lt: new Date(Date.now() - VIEW_ONCE_TTL_MS) } })
    .select("+viewOnceUrl")
    .limit(50);
  for (const m of stale) {
    const url = m.viewOnceUrl;
    const claimed = await Message.findOneAndUpdate({ _id: m._id, viewOnceOpened: false }, { $set: { viewOnceOpened: true }, $unset: { viewOnceUrl: 1 } });
    if (claimed && url) await destroyPrivateAsset(url).catch((e) => console.log("View-once cleanup failed:", e.message));
  }
}

async function tick() {
  await purgeExpiredViewOnce().catch((e) => console.log("View-once purge error:", e.message));
  await messageReminders().catch((e) => console.log("Message reminder error:", e.message));
  await callReminders().catch((e) => console.log("Call reminder error:", e.message));
  await rollRepeatingCalls().catch((e) => console.log("Repeating call error:", e.message));
  await purgeExpiredAccounts().catch((e) => console.log("Account purge error:", e.message));
  await endExpiredMutes().catch((e) => console.log("Mute expiry error:", e.message));
  await birthdayPushes().catch((e) => console.log("Birthday push error:", e.message));
  const due = await ScheduledMessage.find({ sendAt: { $lte: new Date() } }).sort({ sendAt: 1 }).limit(30).lean();
  for (const item of due) {
    // A repeating one moves on to its next date (until its one year is over); a one-time one is removed.
    // Either way it is claimed first, so one date can never be sent twice.
    const nx = item.repeat && item.repeat !== "none" ? nextAfterNow(+new Date(item.firstAt || item.sendAt), item.occurrence || 0, item.repeat, item.tz || "UTC", item.repeatUntil) : null;
    const claimed = nx
      ? await ScheduledMessage.findOneAndUpdate({ _id: item._id, sendAt: item.sendAt }, { $set: { sendAt: nx.next, occurrence: nx.n } })
      : await ScheduledMessage.findOneAndDelete({ _id: item._id });
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
