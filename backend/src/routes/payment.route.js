import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { paymentConfig, createPaymentOrder, verifyPayment, paymentCallback, paymentStatus, cancelPayment, paymentHistory, pinStatus, setPin, setPayPhone, sendPayment } from "../controllers/payment.controller.js";

const router = express.Router();

// Razorpay's redirect lands here without our cookie; the payment signature is what authenticates it.
router.post("/callback", express.urlencoded({ extended: true, limit: "50kb" }), paymentCallback);
router.get("/config", protectRoute, paymentConfig);
router.get("/", protectRoute, paymentHistory);
router.get("/pin", protectRoute, pinStatus);
router.post("/pin", protectRoute, setPin);
router.post("/phone", protectRoute, setPayPhone);
router.post("/send", protectRoute, sendPayment);
router.post("/order", protectRoute, createPaymentOrder);
router.get("/status/:orderId", protectRoute, paymentStatus);
router.post("/verify", protectRoute, verifyPayment);
router.post("/cancel", protectRoute, cancelPayment);

export default router;
