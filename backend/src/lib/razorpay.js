import crypto from "crypto";

// Razorpay without extra dependencies: plain REST calls + the documented HMAC check.
// Keys come ONLY from the server environment (never from the repo or the browser):
//   RAZORPAY_KEY_ID      e.g. rzp_test_xxxxxxxx   (also sent to the browser: it is the public key)
//   RAZORPAY_KEY_SECRET  the secret that signs / verifies payments (stays on the server)
const API = "https://api.razorpay.com/v1";

const keyId = () => (process.env.RAZORPAY_KEY_ID || "").trim();
const keySecret = () => (process.env.RAZORPAY_KEY_SECRET || "").trim();

// Play money only: live keys (rzp_live_…) are refused, so a real payment can never start from this app.
export const razorpayLiveKeysBlocked = () => !!keyId() && !keyId().startsWith("rzp_test_");
export const razorpayEnabled = () => !!(keyId() && keySecret()) && keyId().startsWith("rzp_test_");
export const razorpayPublicKey = () => keyId();
export const razorpayTestMode = () => keyId().startsWith("rzp_test_");

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId()}:${keySecret()}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.description || `Razorpay error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const createOrder = ({ amount, receipt, notes }) => call("POST", "/orders", { amount, currency: "INR", receipt, notes });
export const fetchPayment = (paymentId) => call("GET", `/payments/${encodeURIComponent(paymentId)}`);

// Razorpay signs "<order_id>|<payment_id>" with the key secret; anything else is a forged confirmation.
export function signatureValid(orderId, paymentId, signature) {
  if (!orderId || !paymentId || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", keySecret()).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
