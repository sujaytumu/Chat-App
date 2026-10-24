import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getReelFeed, getReel, createReel, likeReel, viewReel, deleteReel } from "../controllers/reel.controller.js";

const router = express.Router();

router.get("/", protectRoute, getReelFeed);
router.get("/:id", protectRoute, getReel);
router.post("/", protectRoute, createReel);
router.put("/:id/like", protectRoute, likeReel);
router.put("/:id/view", protectRoute, viewReel);
router.delete("/:id", protectRoute, deleteReel);

export default router;
