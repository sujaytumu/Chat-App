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
const listCache = new Map(); // userId -> { ids, at }  (a few seconds, so the chat list opens fast)
export const forgetPair = (a, b) => { listCache.delete(String(a)); listCache.delete(String(b)); };
export const forgetVisibility = () => { listCache.clear(); seenCache.clear(); };
export async function visibleUserIds(me) {
  if (me.email !== undefined && isOwner(me)) return null;
  const k = String(me._id || me);
  const c = listCache.get(k);
  if (c && Date.now() - c.at < 8000) return c.ids;
  const ids = await computeVisible(me);
  if (listCache.size > 2000) listCache.clear();
  listCache.set(k, { ids, at: Date.now() });
  return ids;
}
async function computeVisible(me) {
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

// Quick yes/no for one person (used on every send): a short-lived cache, then a couple of indexed single-row lookups
// instead of building the whole visible list.
const seenCache = new Map(); // "me:other" -> expires
export async function canSee(me, otherId) {
  const myId = String(me._id || me);
  const other = String(otherId);
  if (me.email !== undefined && isOwner(me)) return true;
  const ck = `${myId}:${other}`;
  const hit = seenCache.get(ck);
  if (hit && hit > Date.now()) return true;
  const [owner, existing, allowed] = await Promise.all([
    ownerId(),
    Message.exists({ $or: [{ senderId: myId, receiverId: other }, { senderId: other, receiverId: myId }], groupId: null }),
    Visibility.exists({ key: pairKey(myId, other) }),
  ]);
  const ok = other === myId || other === owner || !!existing || !!allowed;
  if (ok) {
    if (seenCache.size > 5000) seenCache.clear();
    seenCache.set(ck, Date.now() + 10 * 60_000);
  }
  return ok;
}

export { Visibility, pairKey };
