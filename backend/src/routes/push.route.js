import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush } from "../controllers/push.controller.js";

const router = express.Router();

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", protectRoute, subscribeToPush);
router.post("/unsubscribe", protectRoute, unsubscribeFromPush);

export default router;
