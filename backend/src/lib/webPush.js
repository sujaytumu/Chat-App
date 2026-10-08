import webpush from "web-push";
import User from "../models/user.model.js";

let configured = false;

export function configureWebPush() {
  if (configured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("Web Push not configured (missing VAPID keys) — skipping background push notifications.");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

// Sends a background push notification to every device the given user has
// subscribed on. Works even if the site/tab is fully closed, as long as the
// browser itself is running. Prunes subscriptions the push service reports
// as gone (410) or not found (404).
// options: { urgency: "very-low"|"low"|"normal"|"high", TTL: seconds }.
// Calls use urgency "high" + a short TTL so phones wake up for them right away
// and a stale "ringing" push is never delivered long after the call is over.
export async function sendPushToUser(userId, payload, options = {}, muteKey) {
  return sendPushToUsers([userId], payload, options, muteKey);
}

// Same, for several users with ONE database query (group chats).
// muteKey ("d:<senderId>" / "g:<groupId>"): members who muted that chat get no push.
export async function sendPushToUsers(userIds, payload, options = {}, muteKey) {
  if (!configured || !userIds?.length) return;
  try {
    const users = await User.find({ _id: { $in: userIds } }).select("pushSubscriptions mutedChats").lean();
    await Promise.all(
      users
        .filter((u) => !(muteKey && (u.mutedChats || []).includes(muteKey)))
        .map((u) => pushToSubscriptions(u, payload, options))
    );
  } catch (error) {
    console.log("Error in sendPushToUsers:", error.message);
  }
}

async function pushToSubscriptions(user, payload, options) {
  const userId = user._id;
  try {
    if (!user.pushSubscriptions?.length) return;

    const staleEndpoints = [];
    await Promise.all(
      user.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify(payload),
            { urgency: "high", TTL: 60 * 60 * 24, ...options }
          );
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.log("Push send error:", err.message);
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      await User.updateOne(
        { _id: userId },
        { $pull: { pushSubscriptions: { endpoint: { $in: staleEndpoints } } } }
      );
    }
  } catch (error) {
    console.log("Error in sendPushToUser:", error.message);
  }
}
