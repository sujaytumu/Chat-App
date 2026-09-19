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
