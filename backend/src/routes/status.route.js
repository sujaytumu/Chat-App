import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { createStatus, getStatusFeed, markStatusViewed, deleteStatus } from "../controllers/status.controller.js";

const router = express.Router();

router.get("/", protectRoute, getStatusFeed);
router.post("/", protectRoute, createStatus);
router.put("/:id/view", protectRoute, markStatusViewed);
router.delete("/:id", protectRoute, deleteStatus);

export default router;
