import mongoose from "mongoose";
import User from "../models/user.model.js";

// "Who can see this": everyone allowed to see me (mode "all"), everyone except some people, or only some people.
// This sits ON TOP of the owner's access rules (lib/visibility.js): nobody sees more than the owner allowed,
// and my own audience can only make it stricter.
export const KINDS = ["status", "highlights", "reels", "posts"];

export const audienceAllows = (a, viewerId) => {
  if (!a || !a.mode || a.mode === "all") return true;
  const listed = (a.users || []).some((u) => String(u) === String(viewerId));
  return a.mode === "only" ? listed : !listed;
};

// Mongo condition for a list query: my own items, items for everyone, or items whose audience includes me.
export const audienceFilter = (meId) => ({
  $or: [
    { userId: meId },
    { "audience.mode": { $in: [null, "all"] } },
    { "audience.mode": "except", "audience.users": { $ne: meId } },
    { "audience.mode": "only", "audience.users": meId },
  ],
});

// { mode, users } from the client -> a clean value, or null when it is not a usable audience
export const cleanAudience = (a, myId) => {
  if (!a || !["all", "except", "only"].includes(a.mode)) return null;
  if (a.mode === "all") return { mode: "all", users: [] };
  const users = [...new Set((Array.isArray(a.users) ? a.users : []).map(String))].filter((id) => mongoose.isValidObjectId(id) && id !== String(myId)).slice(0, 1000);
  if (a.mode === "only" && !users.length) return null;
  return { mode: a.mode, users };
};

// The audience this person chose as their default for new items of one kind (null = everyone)
export const defaultAudienceFor = async (userId, kind) => {
  const u = await User.findById(userId).select(`contentPrivacy.${kind}`).lean();
  const d = u?.contentPrivacy?.[kind];
  if (!d || !d.mode || d.mode === "all") return null;
  return cleanAudience({ mode: d.mode, users: d.users || [] }, userId);
};
