import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { getUserLean } from "../lib/authCache.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // expired / tampered cookie = "not signed in", not a server error
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    const user = await getUserLean(decoded.userId); // cached for a few seconds; any write to the user clears it

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Signed out everywhere / account deleted since this token was issued
    if (user.deleted || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
      res.cookie("jwt", "", { maxAge: 0 });
      return res.status(401).json({ message: "Unauthorized - Session ended" });
    }

    // A login that was removed from "Linked devices" is signed out (older logins carry no sid and stay valid)
    if (decoded.sid) {
      const mine = (user.sessions || []).find((x) => x.sid === decoded.sid);
      if (!mine && Date.now() / 1000 - (decoded.iat || 0) > 20) { // (a brand-new login may still be being recorded)
        res.cookie("jwt", "", { maxAge: 0 });
        return res.status(401).json({ message: "Unauthorized - Session ended" });
      }
      req.sid = decoded.sid;
      // keep "last active" fresh, at most every 5 minutes
      if (mine && (!mine.lastActive || Date.now() - new Date(mine.lastActive).getTime() > 5 * 60 * 1000)) {
        User.updateOne({ _id: user._id, "sessions.sid": decoded.sid }, { $set: { "sessions.$.lastActive": new Date() } }).catch(() => {});
      }
    }

    req.user = User.hydrate(user);

    next();
  } catch (error) {
    console.log("Error in protectRoute middleware: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
