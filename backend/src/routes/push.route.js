import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush, registerFcmToken, unregisterFcmToken, deviceDelivered, pushStatus } from "../controllers/push.controller.js";

const router = express.Router();

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", protectRoute, subscribeToPush);
router.post("/unsubscribe", protectRoute, unsubscribeFromPush);

router.post("/device-delivered", deviceDelivered);
router.post("/fcm-register", protectRoute, registerFcmToken);
router.get("/status", protectRoute, pushStatus);
router.post("/fcm-unregister", protectRoute, unregisterFcmToken);

export default router;
