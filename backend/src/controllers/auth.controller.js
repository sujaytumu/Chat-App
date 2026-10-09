import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

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
      generateToken(newUser._id, res);
      await newUser.save();

      res.status(201).json({
        _id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        profilePic: newUser.profilePic,
        archivedChats: newUser.archivedChats || [],
        pinnedChats: newUser.pinnedChats || [],
        mutedChats: newUser.mutedChats || [],
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

    generateToken(user._id, res);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      archivedChats: user.archivedChats || [],
      pinnedChats: user.pinnedChats || [],
      mutedChats: user.mutedChats || [],
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
    await user.save();

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
