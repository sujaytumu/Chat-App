// A reel can only be sent to people who may see it. The reel's owner decides that (who can see this reel, on top of
// the owner's access rules), so a message that carries a reel link is checked on the SERVER for the sender and for
// every person who would receive it. If anyone is not allowed, nothing is sent: no link, no owner name, no preview.
import Reel from "../models/reel.model.js";
import { canSee } from "./visibility.js";
import { audienceAllows } from "./audience.js";

const LINK = /\/reels\?r=([a-f0-9]{24})/gi;

export const reelIdsIn = (text) => [...new Set([...String(text || "").matchAll(LINK)].map((m) => m[1]))].slice(0, 5);

const mayWatch = async (reel, userId) =>
  String(userId) === String(reel.userId) || (audienceAllows(reel.audience, userId) && (await canSee({ _id: userId }, reel.userId)));

// null when the message is fine; otherwise the text to show the sender. It never says who was left out,
// because that would reveal the reel owner's choices.
export async function reelShareProblem(text, senderId, recipientIds = []) {
  const ids = reelIdsIn(text);
  if (!ids.length) return null;
  const reels = await Reel.find({ _id: { $in: ids } }).select("userId audience").lean();
  const others = [...new Set(recipientIds.map(String))].filter((id) => id !== String(senderId));
  for (const reel of reels) {
    if (!reel.userId) continue; // a Discover clip: open to everyone
    if (!(await mayWatch(reel, senderId))) return "This reel isn't available";
    const results = await Promise.all(others.map((uid) => mayWatch(reel, uid)));
    if (results.some((ok) => !ok)) return others.length > 1 ? "This reel can't be shared in this chat" : "This reel can't be shared with them";
  }
  return null;
}
