import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { paymentConfig, createPaymentOrder, verifyPayment, cancelPayment, paymentHistory } from "../controllers/payment.controller.js";

const router = express.Router();

router.get("/config", protectRoute, paymentConfig);
router.get("/", protectRoute, paymentHistory);
router.post("/order", protectRoute, createPaymentOrder);
router.post("/verify", protectRoute, verifyPayment);
router.post("/cancel", protectRoute, cancelPayment);

export default router;
