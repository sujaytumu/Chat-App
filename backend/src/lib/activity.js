import Activity from "../models/activity.model.js";
import { io, getReceiverSocketId } from "./socket.js";

// Saves one activity row for the owner and pings their open app. Never throws.
export async function logActivity({ to, actor, type, kind, targetId, thumb = "", text = "" }) {
  try {
    if (!to || !actor?._id || String(to) === String(actor._id)) return;
    const base = { userId: to, actorId: actor._id, type, kind, targetId };
    if (type === "like") await Activity.deleteMany(base); // one row per person per item, newest on top
    const doc = await Activity.create({ ...base, thumb, text: String(text).slice(0, 200) });
    const sid = getReceiverSocketId(String(to));
    if (sid) io.to(sid).emit("activity", { id: String(doc._id) });
  } catch (e) {
    console.log("logActivity:", e.message);
  }
}
