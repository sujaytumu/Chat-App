import mongoose from "mongoose";
import Visibility from "../models/visibility.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { pairKey } from "../models/directChatSetting.model.js";

// Nobody sees other people in the app unless the OWNER has allowed it. Three things make two people visible to
// each other: the owner allowed the pair, they already have a chat together, or one of them is the owner.
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "sujaybabutumu@gmail.com").trim().toLowerCase();
export const isOwner = (user) => String(user?.email || "").trim().toLowerCase() === OWNER_EMAIL;

let ownerIdCache = { id: null, at: 0 };
async function ownerId() {
  if (ownerIdCache.id && Date.now() - ownerIdCache.at < 60_000) return ownerIdCache.id;
  const o = await User.findOne({ email: OWNER_EMAIL }).select("_id").lean();
  ownerIdCache = { id: o ? String(o._id) : null, at: Date.now() };
  return ownerIdCache.id;
}

// null = everybody (the owner); otherwise the set of user ids this person may see.
export async function visibleUserIds(me) {
  const myId = new mongoose.Types.ObjectId(String(me._id || me));
  if (me.email !== undefined && isOwner(me)) return null;
  const [pairs, sentTo, gotFrom, owner] = await Promise.all([
    Visibility.find({ $or: [{ a: myId }, { b: myId }] }).select("a b").lean(),
    Message.distinct("receiverId", { senderId: myId, groupId: null }),
    Message.distinct("senderId", { receiverId: myId, groupId: null }),
    ownerId(),
  ]);
  const ids = new Set();
  for (const p of pairs) ids.add(String(String(p.a) === String(myId) ? p.b : p.a));
  for (const id of [...sentTo, ...gotFrom]) if (id) ids.add(String(id));
  if (owner) ids.add(owner);
  ids.delete(String(myId));
  return ids;
}

export async function canSee(me, otherId) {
  const ids = await visibleUserIds(me);
  return ids === null || ids.has(String(otherId));
}

export { Visibility, pairKey };
