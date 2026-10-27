import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { listActivity, unreadCount, markAllRead } from "../controllers/activity.controller.js";

const router = express.Router();
router.get("/", protectRoute, listActivity);
router.get("/unread", protectRoute, unreadCount);
router.put("/read", protectRoute, markAllRead);
export default router;
