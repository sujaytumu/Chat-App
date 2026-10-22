import mongoose from "mongoose";

// One "send money" attempt between two people, paid through Razorpay (test mode while the keys start with rzp_test_).
const paymentSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true }, // in paise (₹1 = 100)
    currency: { type: String, default: "INR" },
    note: { type: String, default: "", maxlength: 120 },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, default: "" },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
    test: { type: Boolean, default: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
