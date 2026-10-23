// Text messages (SMS) for payment alerts. Uses Twilio's REST API when these server variables are set:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_FROM (a number) or TWILIO_MESSAGING_SERVICE_SID.
// Without them nothing is sent (the in-app card and push notification still go out). Never throws.
const sid = () => process.env.TWILIO_ACCOUNT_SID || "";
const token = () => process.env.TWILIO_AUTH_TOKEN || "";
const from = () => process.env.TWILIO_FROM || "";
const service = () => process.env.TWILIO_MESSAGING_SERVICE_SID || "";

let warned = false;
export const smsEnabled = () => !!(sid() && token() && (from() || service()));

export async function sendSms(to, body) {
  try {
    if (!to) return false;
    if (!smsEnabled()) {
      if (!warned) {
        warned = true;
        console.log("SMS not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM) — payment text messages are off.");
      }
      return false;
    }
    const params = new URLSearchParams({ To: to, Body: body });
    if (service()) params.set("MessagingServiceSid", service());
    else params.set("From", from());
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid()}:${token()}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(15000),
    });
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
