import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getFeed, createPost, likePost, deletePost } from "../controllers/post.controller.js";

const router = express.Router();
router.get("/", protectRoute, getFeed);
router.post("/", protectRoute, createPost);
router.put("/:id/like", protectRoute, likePost);
router.delete("/:id", protectRoute, deletePost);
export default router;
