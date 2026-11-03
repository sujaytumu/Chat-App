import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUserHighlights,
  getHighlight,
  getHighlightsFeed,
  createHighlight,
  updateHighlight,
  deleteHighlight,
  markHighlightItemViewed,
  likeHighlightItem,
} from "../controllers/highlight.controller.js";

const router = express.Router();

router.get("/feed", protectRoute, getHighlightsFeed);
router.get("/user/:userId", protectRoute, getUserHighlights);
router.get("/:id", protectRoute, getHighlight);
router.post("/", protectRoute, createHighlight);
router.put("/:id/items/:itemId/view", protectRoute, markHighlightItemViewed);
router.put("/:id/items/:itemId/like", protectRoute, likeHighlightItem);
router.put("/:id", protectRoute, updateHighlight);
router.delete("/:id", protectRoute, deleteHighlight);

export default router;
