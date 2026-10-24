// Text messages (SMS) for payment alerts, sent through the free, open-source "SMS Gateway for Android"
// (sms-gate.app, Apache-2.0): a spare Android phone with a SIM sends the texts; the app's free cloud
// server gives us a plain HTTPS API. No sign-up, no per-message fee, no DLT paperwork.
//
// Server variables (from the app's "Cloud Server" screen):
//   SMSGATE_USERNAME, SMSGATE_PASSWORD   (optional: SMSGATE_URL, default https://api.sms-gate.app/3rdparty/v1)
// Without them nothing is sent (the in-app payment card and push notification still go out). Never throws.
const user = () => process.env.SMSGATE_USERNAME || "";
const pass = () => process.env.SMSGATE_PASSWORD || "";
const base = () => (process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");

let warned = false;
export const smsEnabled = () => !!(user() && pass());

async function post(path, payload) {
  return fetch(`${base()}${path}`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${user()}:${pass()}`).toString("base64"), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
}

export async function sendSms(to, body) {
  try {
    if (!to) return false;
    if (!smsEnabled()) {
      if (!warned) {
        warned = true;
        console.log("SMS not configured (SMSGATE_USERNAME / SMSGATE_PASSWORD) — payment text messages are off.");
      }
      return false;
    }
    const payload = { textMessage: { text: body }, phoneNumbers: [to] };
    let r = await post("/messages", payload);
    if (r.status === 404 || r.status === 405) r = await post("/message", payload); // older gateway servers
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.log("SMS send failed:", r.status, t.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.log("SMS error:", e.message);
    return false;
  }
}
