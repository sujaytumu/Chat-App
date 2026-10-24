import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { scheduleMessage, listScheduled, cancelScheduled } from "../controllers/scheduled.controller.js";

const router = express.Router();
router.get("/", protectRoute, listScheduled);
router.post("/", protectRoute, scheduleMessage);
router.delete("/:id", protectRoute, cancelScheduled);
export default router;
