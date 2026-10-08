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
export async function sendPushToUser(userId, payload, options = {}) {
  if (!configured) return;
  try {
    const user = await User.findById(userId).select("pushSubscriptions");
    if (!user || user.pushSubscriptions.length === 0) return;

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
