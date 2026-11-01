import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getFeed, createPost, likePost, deletePost, updatePost, getSaved, savePost } from "../controllers/post.controller.js";

const router = express.Router();
router.get("/", protectRoute, getFeed);
router.get("/saved", protectRoute, getSaved);
router.post("/", protectRoute, createPost);
router.put("/:id/like", protectRoute, likePost);
router.put("/:id/save", protectRoute, savePost);
router.put("/:id", protectRoute, updatePost);
router.delete("/:id", protectRoute, deletePost);
export default router;
