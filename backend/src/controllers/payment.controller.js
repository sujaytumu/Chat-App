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

// Step 2: after the Razorpay window closes successfully the browser hands back three values.
// Nothing is trusted until the signature checks out AND Razorpay itself confirms the amount.
export const verifyPayment = async (req, res) => {
  try {
    if (!razorpayEnabled()) return res.status(503).json({ error: "Payments aren't set up on the server yet" });
    const me = req.user._id;
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    const pay = await Payment.findOne({ orderId: String(orderId || ""), fromUserId: me });
    if (!pay) return res.status(404).json({ error: "Payment not found" });
    if (pay.status === "paid") {
      const message = pay.messageId ? await Message.findById(pay.messageId) : null;
      return res.json({ ok: true, message });
    }
    if (!signatureValid(orderId, paymentId, signature)) {
      pay.status = "failed";
      await pay.save();
      return res.status(400).json({ error: "Payment couldn't be verified" });
    }
    const info = await fetchPayment(paymentId);
    if (info.order_id !== pay.orderId || Number(info.amount) !== pay.amount || !["captured", "authorized"].includes(info.status)) {
      pay.status = "failed";
      await pay.save();
      return res.status(400).json({ error: "Payment wasn't completed" });
    }

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
    const socketId = getReceiverSocketId(String(pay.toUserId));
    if (socketId) io.to(socketId).emit("newMessage", message);
    sendPushToUser(pay.toUserId, {
      title: req.user.fullName,
      body: `💸 Sent you ₹${rupees(pay.amount)}${pay.test ? " (test)" : ""}`,
      icon: req.user.profilePic || "/icon-v2-192.png",
      tag: `dm-${me}`,
      data: { url: "/", chatType: "direct", chatId: String(me), messageId: String(message._id) },
    }, {}, `d:${me}`);
    res.status(201).json({ ok: true, message });
  } catch (error) {
    console.log("Error in verifyPayment:", error.message);
    res.status(500).json({ error: "Couldn't confirm the payment" });
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
