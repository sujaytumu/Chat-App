import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendPushToUser } from "../lib/webPush.js";
import { rememberMessage } from "../lib/recentMessages.js";
import { getUserLean } from "../lib/authCache.js";
import { canSee, forgetPair } from "../lib/visibility.js";
import { createOrder, fetchPayment, signatureValid, razorpayEnabled, razorpayPublicKey, razorpayTestMode, razorpayLiveKeysBlocked } from "../lib/razorpay.js";

const MIN_RUPEES = 1;
const MAX_RUPEES = 100000;
const rupees = (paise) => (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const paymentConfig = (req, res) => {
  res.json({ liveBlocked: razorpayLiveKeysBlocked(), enabled: razorpayEnabled(), keyId: razorpayEnabled() ? razorpayPublicKey() : "", test: razorpayTestMode(), min: MIN_RUPEES, max: MAX_RUPEES });
};

// Step 1: the payer picks an amount for a person; we ask Razorpay for an order and remember it.
export const createPaymentOrder = async (req, res) => {
  try {
    if (!razorpayEnabled()) return res.status(503).json({ error: "Payments aren't set up on the server yet" });
    const me = req.user._id;
    const { toUserId, note } = req.body || {};
    const amountRupees = Number(req.body?.amount);
    if (!mongoose.isValidObjectId(toUserId)) return res.status(400).json({ error: "Pick who to pay" });
    if (String(toUserId) === String(me)) return res.status(400).json({ error: "You can't pay yourself" });
    if (!Number.isFinite(amountRupees) || amountRupees < MIN_RUPEES || amountRupees > MAX_RUPEES) {
      return res.status(400).json({ error: `Enter an amount between ₹${MIN_RUPEES} and ₹${MAX_RUPEES.toLocaleString("en-IN")}` });
    }
    const amount = Math.round(amountRupees * 100);
    const receiver = await getUserLean(toUserId);
    if (!receiver || !(await canSee(req.user, toUserId))) return res.status(404).json({ error: "Person not found" });
    if ((req.user.blockedUsers || []).some((b) => String(b) === String(toUserId))) return res.status(403).json({ error: "You blocked this contact" });
    if (receiver.blockedUsers?.some((b) => String(b) === String(me))) return res.status(403).json({ error: "You can't pay this person" });

    const cleanNote = String(note || "").trim().slice(0, 120);
    const order = await createOrder({ amount, receipt: `tk_${Date.now().toString(36)}`, notes: { from: String(me), to: String(toUserId) } });
    await Payment.create({ fromUserId: me, toUserId, amount, note: cleanNote, orderId: order.id, test: razorpayTestMode() });
    res.status(201).json({ orderId: order.id, amount, currency: "INR", keyId: razorpayPublicKey(), test: razorpayTestMode() });
  } catch (error) {
    console.log("Error in createPaymentOrder:", error.message);
    res.status(502).json({ error: "Couldn't start the payment. Try again." });
  }
};

// Checks a finished payment and records it. Used by both ways Razorpay can hand a result back:
//  - the checkout window's JS callback (/verify, signed-in person), and
//  - a redirect back to the site (/callback) used inside the Android app, where bank pages can't open in a pop-up.
// Nothing is trusted until the signature checks out AND Razorpay itself confirms the amount.
async function finalizePayment({ orderId, paymentId, signature, payerId }) {
  const pay = await Payment.findOne({ orderId: String(orderId || ""), ...(payerId ? { fromUserId: payerId } : {}) });
  if (!pay) return { status: 404, error: "Payment not found" };
  if (pay.status === "paid") {
    const message = pay.messageId ? await Message.findById(pay.messageId) : null;
    return { status: 200, message };
  }
  if (!signatureValid(orderId, paymentId, signature)) {
    pay.status = "failed";
    await pay.save();
    return { status: 400, error: "Payment couldn't be verified" };
  }
  const info = await fetchPayment(paymentId);
  if (info.order_id !== pay.orderId || Number(info.amount) !== pay.amount || !["captured", "authorized"].includes(info.status)) {
    pay.status = "failed";
    await pay.save();
    return { status: 400, error: "Payment wasn't completed" };
  }

  const me = pay.fromUserId;
  const payer = await User.findById(me).select("fullName profilePic").lean();
  pay.status = "paid";
  pay.paymentId = paymentId;
  pay.paidAt = new Date();
  const message = new Message({
    senderId: me,
    receiverId: pay.toUserId,
    text: `💸 Paid ₹${rupees(pay.amount)}`,
    payment: { amount: pay.amount, currency: pay.currency, note: pay.note, status: "paid", paymentId, test: pay.test },
  });
  await message.save();
  pay.messageId = message._id;
  await pay.save();

  forgetPair(me, pay.toUserId);
  rememberMessage(message);
  for (const uid of [String(pay.toUserId), String(me)]) {
    const socketId = getReceiverSocketId(uid);
    if (socketId) io.to(socketId).emit("newMessage", message);
  }
  sendPushToUser(pay.toUserId, {
    title: payer?.fullName || "Talkies",
    body: `💸 Sent you ₹${rupees(pay.amount)}${pay.test ? " (test)" : ""}`,
    icon: payer?.profilePic || "/icon-v2-192.png",
    tag: `dm-${me}`,
    data: { url: "/", chatType: "direct", chatId: String(me), messageId: String(message._id) },
  }, {}, `d:${me}`);
  return { status: 201, message };
}

export const verifyPayment = async (req, res) => {
  try {
    if (!razorpayEnabled()) return res.status(503).json({ error: "Payments aren't set up on the server yet" });
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    const r = await finalizePayment({ orderId, paymentId, signature, payerId: req.user._id });
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.status(r.status).json({ ok: true, message: r.message });
  } catch (error) {
    console.log("Error in verifyPayment:", error.message);
    res.status(500).json({ error: "Couldn't confirm the payment" });
  }
};

// Razorpay sends the person's browser back here (a form POST) when checkout runs in redirect mode (the Android app).
// The signature is the proof, so no sign-in is needed; then the person is sent back into the app.
export const paymentCallback = async (req, res) => {
  const inApp = /TalkiesApp/i.test(req.get("user-agent") || "");
  const back = (q) => {
    const qs = new URLSearchParams(q).toString();
    // Inside the Talkies app's own window: just go back into the app.
    if (inApp) return res.redirect(303, `/?${qs}`);
    // Opened in a normal browser (older app versions send people there): hand them back to the Talkies app.
    const deep = `talkies://pay?${qs}`;
    const ok = q.pay === "ok";
    res.set("Cache-Control", "no-store").type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Talkies</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b141a;color:#e9edef;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:24px;margin:16px 0 6px}p{color:#8696a0;margin:0 0 28px;max-width:320px}.i{font-size:56px}
a.b{display:block;background:#25d366;color:#0b141a;font-weight:700;text-decoration:none;padding:15px 34px;border-radius:30px;font-size:17px}a.s{margin-top:18px;color:#8696a0;font-size:14px}</style></head>
<body><div class="i">${ok ? "✅" : "⚠️"}</div><h1>${ok ? "Payment sent" : "Payment not completed"}</h1>
<p>${ok ? "Your test payment went through." : String(q.reason || "Payment could not be completed").replace(/[<>&"]/g, "")}</p>
<a class="b" href="${deep}">Back to Talkies</a><a class="s" href="/?${qs}">Continue in the browser</a>
<script>setTimeout(function(){location.href=${JSON.stringify(deep)}},400)</script></body></html>`);
  };
  try {
    const b = req.body || {};
    if (b.razorpay_payment_id && b.razorpay_signature) {
      const r = await finalizePayment({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature });
      return r.error ? back({ pay: "failed", reason: r.error }) : back({ pay: "ok" });
    }
    // a failed / cancelled payment: Razorpay sends error[...] fields
    const err = b.error || {};
    const desc = String(err.description || b["error[description]"] || "Payment could not be completed").slice(0, 200);
    const orderId = String(err?.metadata?.order_id || b["error[metadata][order_id]"] || b.order_id || "");
    console.log("Payment failed at Razorpay (redirect):", [err.code || b["error[code]"], desc, err.reason || b["error[reason]"], err.source || b["error[source]"], err.step || b["error[step]"]].filter(Boolean).join(" | ").slice(0, 300));
    if (orderId) await Payment.updateOne({ orderId, status: "created" }, { $set: { status: "failed", failure: desc } });
    return back({ pay: "failed", reason: desc });
  } catch (error) {
    console.log("Error in paymentCallback:", error.message);
    return back({ pay: "failed", reason: "Couldn't confirm the payment" });
  }
};

// The payer closed the window or the payment failed: forget the attempt.
export const cancelPayment = async (req, res) => {
  try {
    const f = req.body?.error || {};
    const failure = [f.code, f.description, f.reason, f.source, f.step].filter(Boolean).join(" | ").slice(0, 300);
    if (failure) console.log("Payment failed at Razorpay:", failure);
    await Payment.updateOne({ orderId: String(req.body?.orderId || ""), fromUserId: req.user._id, status: "created" }, { $set: { status: "failed", ...(failure ? { failure } : {}) } });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
};

// Where does one of my payments stand? (The app asks this when you come back from a bank page opened elsewhere.)
export const paymentStatus = async (req, res) => {
  try {
    const p = await Payment.findOne({ orderId: String(req.params.orderId || ""), fromUserId: req.user._id }).select("status").lean();
    res.set("Cache-Control", "no-store");
    res.json({ status: p?.status || "none" });
  } catch {
    res.json({ status: "none" });
  }
};

// Everything I sent or received that went through.
export const paymentHistory = async (req, res) => {
  try {
    const me = req.user._id;
    const rows = await Payment.find({ status: "paid", $or: [{ fromUserId: me }, { toUserId: me }] })
      .sort({ paidAt: -1 })
      .limit(100)
      .populate("fromUserId toUserId", "fullName profilePic")
      .lean();
    res.json(
      rows.map((p) => ({
        _id: p._id,
        amount: p.amount,
        note: p.note,
        test: p.test,
        paidAt: p.paidAt,
        paymentId: p.paymentId,
        direction: String(p.fromUserId._id) === String(me) ? "sent" : "received",
        other: String(p.fromUserId._id) === String(me) ? p.toUserId : p.fromUserId,
      }))
    );
  } catch (error) {
    console.log("Error in paymentHistory:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
