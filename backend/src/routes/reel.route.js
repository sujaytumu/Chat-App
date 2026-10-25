import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getReelFeed, getReel, createReel, likeReel, viewReel, deleteReel, toggleFollow, toggleSave, getSaved, importDiscover, importStatus, repostReel, getUserReels, reelsByTag, reelsByUser, searchReels, trendingTags, reelInsights, hideReel } from "../controllers/reel.controller.js";

const router = express.Router();

router.get("/", protectRoute, getReelFeed);
router.get("/saved", protectRoute, getSaved);
router.get("/search", protectRoute, searchReels);
router.get("/trending", protectRoute, trendingTags);
router.get("/tag/:tag", protectRoute, reelsByTag);
router.get("/by-user/:id", protectRoute, reelsByUser);
router.get("/:id/insights", protectRoute, reelInsights);
router.put("/:id/hide", protectRoute, hideReel);
router.put("/save", protectRoute, toggleSave);
router.put("/follow/:userId", protectRoute, toggleFollow);
router.post("/import", protectRoute, importDiscover);
router.post("/import-status/:id", protectRoute, importStatus);
router.put("/:id/repost", protectRoute, repostReel);
router.get("/user/:userId", protectRoute, getUserReels);
router.get("/:id", protectRoute, getReel);
router.post("/", protectRoute, createReel);
router.put("/:id/like", protectRoute, likeReel);
router.put("/:id/view", protectRoute, viewReel);
router.delete("/:id", protectRoute, deleteReel);

export default router;
