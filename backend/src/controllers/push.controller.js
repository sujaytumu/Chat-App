import User from "../models/user.model.js";

export const getVapidPublicKey = (req, res) => {
  res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
};

export const subscribeToPush = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid push subscription" });
    }

    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint } } });
    await User.updateOne(
      { _id: req.user._id },
      { $push: { pushSubscriptions: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } } }
    );

    res.status(200).json({ message: "Subscribed" });
  } catch (error) {
    console.log("Error in subscribeToPush controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unsubscribeFromPush = async (req, res) => {
  try {
    const { endpoint } = req.body;
    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint } } });
    res.status(200).json({ message: "Unsubscribed" });
  } catch (error) {
    console.log("Error in unsubscribeFromPush controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Android app: register / drop this install's Firebase token.
export const registerFcmToken = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: "Invalid token" });
    // a token belongs to one account at a time (shared phone / re-login)
    await User.updateMany({ "fcmTokens.token": token }, { $pull: { fcmTokens: { token } } });
    await User.updateOne({ _id: req.user._id }, { $push: { fcmTokens: { token, at: new Date() } } });
    res.status(200).json({ message: "Registered" });
  } catch (error) {
    console.log("Error in registerFcmToken controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unregisterFcmToken = async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    await User.updateOne({ _id: req.user._id }, { $pull: { fcmTokens: { token } } });
    res.status(200).json({ message: "Removed" });
  } catch (error) {
    console.log("Error in unregisterFcmToken controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
