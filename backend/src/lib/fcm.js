import crypto from "crypto";
import User from "../models/user.model.js";

// Firebase Cloud Messaging (HTTP v1) without extra dependencies.
// This is what lets the Android app ring for calls and show message
// notifications even when it is fully closed (Web Push does not work inside
// an Android WebView). Configure with ONE env var:
//   FCM_SERVICE_ACCOUNT = the service-account JSON from Firebase
//   (Project settings → Service accounts → Generate new private key),
//   pasted as-is or base64-encoded.
let account = null;
let loaded = false;
let cached = { token: null, exp: 0 };

function load() {
  if (loaded) return account;
  loaded = true;
  let raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) {
    console.log("FCM not configured (missing FCM_SERVICE_ACCOUNT) — Android background calls/notifications are off.");
    return null;
  }
  try {
    raw = raw.trim();
    if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    if (parsed.client_email && parsed.private_key && parsed.project_id) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      account = parsed;
    }
  } catch (e) {
    console.log("FCM_SERVICE_ACCOUNT could not be read:", e.message);
  }
  return account;
}

export const fcmEnabled = () => !!load();

const b64url = (b) => Buffer.from(b).toString("base64url");

async function accessToken() {
  const acc = load();
  if (!acc) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: acc.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(acc.private_key);
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error_description || "no access token");
  cached = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cached.token;
}

// Data-only, high priority: the app's own service builds the notification /
// call screen, so it can ring and show Answer / Decline.
function toData(payload) {
  const d = payload?.data || {};
  const out = {
    title: payload?.title || "Talkies",
    body: payload?.body || "",
    icon: payload?.icon || "",
    myIcon: payload?.myIcon || "",
    tag: payload?.tag || "",
    isCall: payload?.isCall ? "1" : "0",
    chatId: d.chatId ? String(d.chatId) : "",
    chatType: d.chatType || "direct",
    callerId: d.callerId ? String(d.callerId) : "",
    messageId: d.messageId ? String(d.messageId) : "",
    url: d.url || "/",
    cancel: payload?.cancel ? "1" : "0",
    clear: payload?.clear ? "1" : "0",
    callId: d.callId ? String(d.callId) : payload?.callId ? String(payload.callId) : "",
  };
  return out;
}

async function sendOne(token, payload, isCall) {
  // A ring and its cancel share one collapse key: if the phone has no internet, FCM keeps only the
  // NEWEST of them — so when it comes back online it gets "cancelled" (no ring) instead of ringing
  // for a call that is already over. Only calls / cancels collapse; messages never do.
  const collapse = (isCall || payload?.cancel) && payload?.tag ? String(payload.tag).slice(0, 60) : undefined;
  const acc = load();
  const at = await accessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: toData(payload),
        android: {
          priority: "HIGH",
          ttl: isCall ? "45s" : payload?.cancel ? "60s" : "86400s",
          ...(collapse ? { collapse_key: collapse } : {}),
        },
      },
    }),
  });
  if (res.ok) return "ok";
  let code = "";
  try {
    const j = await res.json();
    code = j?.error?.details?.find?.((x) => x.errorCode)?.errorCode || j?.error?.status || "";
  } catch {
    /* ignore */
  }
  return code || String(res.status);
}

// Pushes to every Android install this user has registered. Dead tokens are pruned.
export async function sendFcmToUser(user, payload) {
  try {
    if (!load() || !user?.fcmTokens?.length) return;
    const isCall = !!payload?.isCall;
    const dead = [];
    await Promise.all(
      user.fcmTokens.map(async ({ token }) => {
        try {
          let r = await sendOne(token, payload, isCall).catch((e) => "error:" + e.message);
          // A ring that fails to leave the server is a call that never rings: retry quickly (token
          // refresh, a cold network, a 5xx from Google) while it is still worth ringing.
          for (let attempt = 1; attempt <= 3 && isCall && r !== "ok" && !["UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND"].includes(r); attempt++) {
            cached = { token: null, exp: 0 };
            await new Promise((ok) => setTimeout(ok, 400 * attempt));
            r = await sendOne(token, payload, isCall).catch((e) => "error:" + e.message);
          }
          if (r === "UNREGISTERED" || r === "INVALID_ARGUMENT" || r === "NOT_FOUND") dead.push(token);
          else if (r !== "ok") console.log("FCM send:", r);
        } catch (e) {
          console.log("FCM error:", e.message);
        }
      })
    );
    if (dead.length) await User.updateOne({ _id: user._id }, { $pull: { fcmTokens: { token: { $in: dead } } } });
  } catch (e) {
    console.log("Error in sendFcmToUser:", e.message);
  }
}

// Stop the ringing on this user's Android phone(s) — the call was answered /
// declined elsewhere. Android only (the web app is told through its socket).
export async function sendFcmCancelCall(userId, callerId, callId) {
  try {
    if (!load()) return;
    const user = await User.findById(userId).select("fcmTokens").lean();
    await sendFcmToUser(user, { cancel: true, tag: `incoming-call-${callerId}`, isCall: false, data: { callId } });
  } catch (e) {
    console.log("Error in sendFcmCancelCall:", e.message);
  }
}

// The messages of one chat were read (on any device): the phone's notification for that chat goes away,
// so it only ever shows what is still unread.
export async function sendFcmClearChat(userId, chatId) {
  try {
    if (!load()) return;
    const user = await User.findById(userId).select("fcmTokens").lean();
    await sendFcmToUser(user, { clear: true, tag: `dm-${chatId}`, isCall: false, data: { chatId: String(chatId) } });
  } catch (e) {
    console.log("Error in sendFcmClearChat:", e.message);
  }
}
