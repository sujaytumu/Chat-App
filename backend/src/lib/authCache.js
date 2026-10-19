import mongoose from "mongoose";
import User from "../models/user.model.js";
import { setUserWriteHandler } from "./authCacheBus.js";

// Every API call used to re-read the signed-in user (a database round trip) before doing anything.
// People are looked up many times a second while chatting, so the plain (lean) record is kept for a
// short time. ANY write to a user clears their entry immediately (see the hooks in user.model.js), so
// signing a device out, blocking someone, changing privacy etc. take effect at once.
const TTL_MS = 30_000;
const MAX = 3000;
const cache = new Map(); // userId -> { doc, at }
let epoch = 0; // bumped on every write; a read that raced a write is never cached

export function invalidateAuthUser(id) {
  epoch++;
  if (id) cache.delete(String(id));
  else cache.clear();
}
setUserWriteHandler(invalidateAuthUser);

export async function getUserLean(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.doc;
  const start = epoch;
  const doc = await User.findById(key).select("-password -pushSubscriptions").lean();
  if (doc && start === epoch) {
    if (cache.size >= MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { doc, at: Date.now() });
  }
  return doc;
}

// A fresh mongoose document for one request (controllers may call .save() on it).
export async function getUserDoc(id) {
  const lean = await getUserLean(id);
  return lean ? User.hydrate(lean) : null;
}
