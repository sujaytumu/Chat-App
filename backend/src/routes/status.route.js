import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { searchSongs, songAudio } from "../controllers/music.controller.js";
import { createStatus, getStatusFeed, markStatusViewed, deleteStatus, likeStatus } from "../controllers/status.controller.js";

const router = express.Router();

router.get("/", protectRoute, getStatusFeed);
router.get("/music/search", protectRoute, searchSongs);
router.get("/music/audio", protectRoute, songAudio);
router.post("/", protectRoute, createStatus);
router.put("/:id/view", protectRoute, markStatusViewed);
router.put("/:id/like", protectRoute, likeStatus);
router.delete("/:id", protectRoute, deleteStatus);

export default router;
