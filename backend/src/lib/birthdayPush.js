import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import { sendPushToUsers } from "./webPush.js";
import { canSee } from "./visibility.js";

const IST_MS = 5.5 * 3600 * 1000;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Today in India (IST), whatever time zone the server runs in: the date, the hour and a key that changes each day.
export function istToday(now = Date.now()) {
  const d = new Date(now + IST_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return { year, month, day, hour: d.getUTCHours(), key: `${year}-${month}-${day}` };
}

// Which (month, day) pairs count as "birthday today": 29 Feb is celebrated on 1 March in years with no 29 Feb.
export function birthdaysToday(t) {
  const out = [{ month: t.month, day: t.day }];
  if (t.month === 3 && t.day === 1 && !isLeap(t.year)) out.push({ month: 2, day: 29 });
  return out;
}

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "your friend";

// People who would want to know: everyone sharing a group with them plus 1:1 chat partners from the last 90 days,
// minus anyone blocked either way or who is not allowed to see them in the owner's access list.
async function audienceFor(person) {
  const pid = String(person._id);
  const since = new Date(Date.now() - 90 * 86400000);
  const [groups, sentTo, receivedFrom] = await Promise.all([
    Group.find({ members: person._id }).select("members").lean(),
    Message.distinct("receiverId", { senderId: person._id, createdAt: { $gte: since } }),
    Message.distinct("senderId", { receiverId: person._id, createdAt: { $gte: since } }),
  ]);
  const ids = new Set([...groups.flatMap((g) => g.members.map(String)), ...sentTo.filter(Boolean).map(String), ...receivedFrom.filter(Boolean).map(String)]);
  ids.delete(pid);
  const blockedByMe = new Set((person.blockedUsers || []).map(String));
  const users = await User.find({ _id: { $in: [...ids].slice(0, 300) }, deleted: { $ne: true } }).select("blockedUsers").lean();
  const out = [];
  for (const u of users) {
    const uid = String(u._id);
    if (blockedByMe.has(uid) || (u.blockedUsers || []).some((b) => String(b) === pid)) continue;
    if (!(await canSee(uid, pid))) continue;
    out.push(uid);
  }
  return out;
}

let lastRun = 0;
// Once a day, from 8 am IST: a "Happy birthday" push to the person and a "wish them" push to their circle.
// Claimed per person per day, so restarts and repeated checks can never send it twice.
export async function birthdayPushes() {
  if (Date.now() - lastRun < 10 * 60000) return; // the scheduler ticks every 15 s — a database check every 10 min is plenty
  lastRun = Date.now();
  const t = istToday();
  if (t.hour < 8 || t.hour >= 21) return;
  const dates = birthdaysToday(t);
  const people = await User.find({ deleted: { $ne: true }, birthdayPushedOn: { $ne: t.key }, $or: dates.map((d) => ({ "birthday.month": d.month, "birthday.day": d.day })) })
    .select("fullName profilePic blockedUsers")
    .limit(30)
    .lean();
  for (const p of people) {
    const claimed = await User.findOneAndUpdate({ _id: p._id, birthdayPushedOn: { $ne: t.key } }, { $set: { birthdayPushedOn: t.key } });
    if (!claimed) continue;
    const name = firstName(p.fullName);
    sendPushToUsers([p._id], { title: "🎂 Happy birthday!", body: `Wishing you a wonderful day, ${name}! 🎉`, icon: "/icon-v2-192.png", tag: `bday-me-${t.key}`, data: { url: "/" } });
    const audience = await audienceFor(p);
    if (audience.length) {
      sendPushToUsers(audience, { title: `🎂 ${name}'s birthday`, body: `It's ${p.fullName || name}'s birthday today — send your wishes!`, icon: "/icon-v2-192.png", tag: `bday-${p._id}-${t.key}`, data: { url: "/" } });
    }
  }
}
