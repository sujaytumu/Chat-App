import jwt from "jsonwebtoken";
import { generateToken, deviceLabel } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";
import Status from "../models/status.model.js";
import Group from "../models/group.model.js";
import { io } from "../lib/socket.js";
import { createQr, qrInfo, approveQr, collectQr } from "../lib/qrLogin.js";

export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    // Only plain strings (blocks {"$ne": null}-style query injection)
    if ([fullName, email, password].some((v) => typeof v !== "string")) {
      return res.status(400).json({ message: "Invalid input" });
    }
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findOne({ email });

    if (user) return res.status(400).json({ message: "Email already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    if (newUser) {
      // generate jwt token here
      generateToken(newUser._id, res, newUser.tokenVersion || 0, req);
      await newUser.save();

      res.status(201).json({
        _id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        profilePic: newUser.profilePic,
        archivedChats: newUser.archivedChats || [],
        lockedChats: newUser.lockedChats || [],
        pinnedChats: newUser.pinnedChats || [],
        mutedChats: newUser.mutedChats || [],
        markedUnread: newUser.markedUnread || [],
      chatLists: newUser.chatLists || [],
      privacy: newUser.privacy,
      blockedUsers: newUser.blockedUsers || [],
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Two-step verification: password was right, now ask for the 6-digit code.
    if (user.twoFactor?.enabled) {
      const ticket = jwt.sign({ userId: user._id, purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m" });
      return res.status(200).json({ twoFactorRequired: true, ticket });
    }

    generateToken(user._id, res, user.tokenVersion || 0, req);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      archivedChats: user.archivedChats || [],
      lockedChats: user.lockedChats || [],
      pinnedChats: user.pinnedChats || [],
      mutedChats: user.mutedChats || [],
      markedUnread: user.markedUnread || [],
      chatLists: user.chatLists || [],
      privacy: user.privacy,
      blockedUsers: user.blockedUsers || [],
    });
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = (req, res) => {
  try {
    // This device leaves the Linked devices list
    const old = req.cookies?.jwt ? jwt.decode(req.cookies.jwt) : null;
    if (old?.userId && old?.sid) User.updateOne({ _id: old.userId }, { $pull: { sessions: { sid: old.sid } } }).catch(() => {});
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic, fullName, about } = req.body;
    const userId = req.user._id;
    const update = {};

    if (fullName !== undefined) {
      if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 50) {
        return res.status(400).json({ message: "Name must be 1-50 characters" });
      }
      update.fullName = fullName.trim();
    }

    if (about !== undefined) {
      if (typeof about !== "string" || about.trim().length > 139) {
        return res.status(400).json({ message: "About must be at most 139 characters" });
      }
      update.about = about.trim();
    }

    if (profilePic !== undefined) {
      if (typeof profilePic !== "string" || !profilePic) {
        return res.status(400).json({ message: "Profile pic is required" });
      }
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      update.profilePic = uploadResponse.secure_url;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, update, { new: true }).select(
      "-password -pushSubscriptions"
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "Invalid input" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // every other device must sign in again
    await user.save();
    generateToken(user._id, res, user.tokenVersion, req);
    endOtherSessions(user._id);

    res.status(200).json({ message: "Password changed" });
  } catch (error) {
    console.log("error in change password:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// ---- Look & sound settings that follow the account across devices ----
const PREF_KEYS = new Set([
  "chat-theme",
  "talkies-wallpapers",
  "talkies-chat-looks",
  "talkies-wallpaper-off",
  "talkies-reduce-motion",
  "talkies-haptics-off",
  "talkies-enter-newline",
  "talkies-message-sound-enabled",
  "talkies-call-ringtone-enabled",
  "talkies-call-tone",
  "talkies-message-tone",
  "talkies-group-tone",
  "talkies-vib-message",
  "talkies-vib-group",
  "talkies-vib-call",
]);
const MAX_PREF_VALUE = 450 * 1024;

export const getPreferences = async (req, res) => {
  res.status(200).json(req.user.preferences || {});
};

// Body: { prefs: { key: string | null } } — merged into what's saved; null removes a key.
export const updatePreferences = async (req, res) => {
  try {
    const incoming = req.body?.prefs;
    if (!incoming || typeof incoming !== "object") return res.status(400).json({ message: "Invalid settings" });
    const merged = { ...(req.user.preferences || {}) };
    for (const [key, value] of Object.entries(incoming)) {
      if (!PREF_KEYS.has(key)) continue;
      if (value === null) delete merged[key];
      else if (typeof value === "string" && value.length <= MAX_PREF_VALUE) merged[key] = value;
    }
    await User.updateOne({ _id: req.user._id }, { $set: { preferences: merged } });
    res.status(200).json(merged);
  } catch (error) {
    console.log("Error in updatePreferences controller: ", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Drop every live connection of this account. Each device then re-checks its
// login: the one that just acted holds the new token and reconnects, the rest
// are signed out.
async function endOtherSessions(userId) {
  try {
    const room = String(userId);
    io.to(room).emit("forceLogout");
    const sockets = await io.in(room).fetchSockets();
    sockets.forEach((s) => s.disconnect(true));
  } catch (error) {
    console.log("Error ending sessions:", error.message);
  }
}

// "Log out of all devices": invalidates every login token except the one used now.
export const logoutAllDevices = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } }, { new: true }).select("tokenVersion");
    generateToken(req.user._id, res, user.tokenVersion, req);
    endOtherSessions(req.user._id);
    res.status(200).json({ message: "Logged out of all other devices" });
  } catch (error) {
    console.log("Error in logoutAllDevices controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Permanently close the account (password required). Removes the person from
// groups and deletes their statuses; their profile is wiped and they vanish
// from everyone's contact list. Messages already sent stay in other people's chats.
export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== "string" || !password) return res.status(400).json({ message: "Enter your password" });

    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "That password isn't right" });
    }

    const uid = user._id;
    await Status.deleteMany({ userId: uid });
    await Group.updateMany({ members: uid }, { $pull: { members: uid, admins: uid } });
    await Group.deleteMany({ members: { $size: 0 } });

    const salt = await bcrypt.genSalt(10);
    user.fullName = "Deleted account";
    user.email = `deleted-${uid}@deleted.invalid`;
    user.password = await bcrypt.hash(`${uid}-${Date.now()}-${Math.random()}`, salt);
    user.profilePic = "";
    user.about = "";
    user.pushSubscriptions = [];
    user.uiPrefs = {};
    user.archivedChats = [];
    user.pinnedChats = [];
    user.mutedChats = [];
    user.deleted = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await endOtherSessions(uid);
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    console.log("Error in deleteAccount controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---- Log in with QR code (link a new browser / device from the phone) ----
const accountPayload = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  profilePic: user.profilePic,
  archivedChats: user.archivedChats || [],
  lockedChats: user.lockedChats || [],
  pinnedChats: user.pinnedChats || [],
  mutedChats: user.mutedChats || [],
  markedUnread: user.markedUnread || [],
  chatLists: user.chatLists || [],
  privacy: user.privacy,
  blockedUsers: user.blockedUsers || [],
});

// The browser asks for a code to show as a QR.
export const qrNew = (req, res) => {
  const made = createQr(req.ip || "x", deviceLabel(req.headers["user-agent"] || ""));
  if (!made) return res.status(429).json({ message: "Too many QR codes — wait a moment" });
  res.status(200).json(made);
};

// The browser asks whether the phone has approved yet.
export const qrPoll = async (req, res) => {
  try {
    const { code, poll } = req.body || {};
    if (typeof code !== "string" || typeof poll !== "string") return res.status(400).json({ message: "Invalid request" });
    const r = collectQr(code, poll);
    if (r.state === "expired") return res.status(410).json({ message: "This QR code expired" });
    if (r.state === "waiting") return res.status(200).json({ status: "waiting" });
    const user = await User.findById(r.userId);
    if (!user || user.deleted) return res.status(410).json({ message: "This QR code expired" });
    generateToken(user._id, res, user.tokenVersion || 0, req);
    res.status(200).json({ status: "approved", user: accountPayload(user) });
  } catch (error) {
    console.log("Error in qrPoll controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// The phone looks at a scanned code before approving: which device is asking?
export const qrLookup = (req, res) => {
  const info = qrInfo(req.params.code);
  if (!info || info.status !== "waiting") return res.status(404).json({ message: "This QR code expired — refresh it on the other screen" });
  res.status(200).json(info);
};

// The phone says "yes, link it".
export const qrApprove = (req, res) => {
  const code = req.body?.code;
  if (typeof code !== "string" || !approveQr(code, req.user._id)) {
    return res.status(404).json({ message: "This QR code expired — refresh it on the other screen" });
  }
  res.status(200).json({ message: "Device linked" });
};

// ---- Linked devices ----
export const listSessions = async (req, res) => {
  try {
    let mySid = req.sid;
    if (!mySid) {
      // This device signed in before the list existed: give it a tracked login now (same account, same device)
      const t = generateToken(req.user._id, res, req.user.tokenVersion || 0, req);
      mySid = jwt.decode(t)?.sid;
      await new Promise((r) => setTimeout(r, 150)); // let the new entry land
    }
    const user = await User.findById(req.user._id).select("sessions tokenVersion").lean();
    const tv = user?.tokenVersion || 0;
    const sessions = (user?.sessions || [])
      .filter((x) => (x.tv || 0) === tv)
      .map((x) => ({ sid: x.sid, device: x.device || "Browser", createdAt: x.createdAt, lastActive: x.lastActive, current: x.sid === mySid }))
      .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || new Date(b.lastActive) - new Date(a.lastActive));
    res.status(200).json(sessions);
  } catch (error) {
    console.log("Error in listSessions controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const endSession = async (req, res) => {
  try {
    const { sid } = req.params;
    if (!sid || sid === req.sid) return res.status(400).json({ message: "Use Log out to leave this device" });
    await User.updateOne({ _id: req.user._id }, { $pull: { sessions: { sid } } });
    // Cut that device's live connection, if it has one
    try {
      const sockets = await io.in(String(req.user._id)).fetchSockets();
      sockets.filter((s) => s.data.sid === sid).forEach((s) => {
        s.emit("forceLogout");
        s.disconnect(true);
      });
    } catch {
      /* it signs out on its next request anyway */
    }
    res.status(200).json({ message: "Device logged out" });
  } catch (error) {
    console.log("Error in endSession controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---- @username: find people without an email, share a profile link / QR ----
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,22})[a-z0-9]$/; // 3-24 characters, starts and ends with a letter or digit
const RESERVED = new Set(["admin", "talkies", "support", "help", "system", "official", "root", "me", "you", "null", "undefined"]);

const checkName = (raw) => {
  if (typeof raw !== "string") return { error: "Invalid username" };
  const name = raw.trim().replace(/^@/, "").toLowerCase();
  if (!USERNAME_RE.test(name) || name.includes("..") || name.includes("__") || name.includes("._") || name.includes("_.")) {
    return { error: "Use 3-24 letters, numbers, . or _ (start and end with a letter or number)" };
  }
  if (RESERVED.has(name)) return { error: "That username isn't available" };
  return { name };
};

// GET /auth/username/check?u=name  ->  { available, error? }
export const checkUsername = async (req, res) => {
  try {
    const { name, error } = checkName(req.query.u);
    if (error) return res.status(200).json({ available: false, error });
    if (req.user.username === name) return res.status(200).json({ available: true, mine: true });
    const taken = await User.exists({ username: name, _id: { $ne: req.user._id } });
    res.status(200).json(taken ? { available: false, error: "Already taken" } : { available: true });
  } catch (error) {
    console.log("error in checkUsername:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// PUT /auth/username { username }  (empty string removes it)
export const setUsername = async (req, res) => {
  try {
    const raw = req.body?.username;
    let update;
    if (raw === "" || raw === null) {
      update = { $unset: { username: 1 } };
    } else {
      const { name, error } = checkName(raw);
      if (error) return res.status(400).json({ message: error });
      if (await User.exists({ username: name, _id: { $ne: req.user._id } })) {
        return res.status(409).json({ message: "That username is already taken" });
      }
      update = { username: name };
    }
    try {
      const updated = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("-password -pushSubscriptions");
      return res.status(200).json(updated);
    } catch (e) {
      if (e?.code === 11000) return res.status(409).json({ message: "That username is already taken" });
      throw e;
    }
  } catch (error) {
    console.log("error in setUsername:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET /auth/u/:username  ->  the person's public card (same details the chat list already shows)
export const findByUsername = async (req, res) => {
  try {
    const { name, error } = checkName(req.params.username);
    if (error) return res.status(404).json({ message: "No one with that username" });
    const user = await User.findOne({ username: name, deleted: { $ne: true } }).select("fullName profilePic about username").lean();
    if (!user) return res.status(404).json({ message: "No one with that username" });
    res.status(200).json(user);
  } catch (error) {
    console.log("error in findByUsername:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
