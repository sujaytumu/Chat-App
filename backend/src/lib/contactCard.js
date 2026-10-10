import mongoose from "mongoose";
import User from "../models/user.model.js";

// Turns a user id from the client into a contact card (name + photo only —
// never the email or anything private).
export async function buildContact(contactUserId) {
  if (!contactUserId || !mongoose.isValidObjectId(contactUserId)) return null;
  const u = await User.findById(contactUserId).select("fullName profilePic").lean();
  return u ? { userId: u._id, fullName: u.fullName, profilePic: u.profilePic || "" } : null;
}
