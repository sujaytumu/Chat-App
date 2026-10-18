import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUserHighlights,
  getHighlightsFeed,
  createHighlight,
  updateHighlight,
  deleteHighlight,
} from "../controllers/highlight.controller.js";

const router = express.Router();

router.get("/feed", protectRoute, getHighlightsFeed);
router.get("/user/:userId", protectRoute, getUserHighlights);
router.post("/", protectRoute, createHighlight);
router.put("/:id", protectRoute, updateHighlight);
router.delete("/:id", protectRoute, deleteHighlight);

export default router;
