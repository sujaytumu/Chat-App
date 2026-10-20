import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { listChannels, createChannel, updateChannel, deleteChannel, getChannel, followChannel, unfollowChannel, createPost, deletePost, reactToPost } from "../controllers/channel.controller.js";

const router = express.Router();
router.get("/", protectRoute, listChannels);
router.post("/", protectRoute, createChannel);
router.get("/:id", protectRoute, getChannel);
router.put("/:id", protectRoute, updateChannel);
router.delete("/:id", protectRoute, deleteChannel);
router.post("/:id/follow", protectRoute, followChannel);
router.delete("/:id/follow", protectRoute, unfollowChannel);
router.post("/:id/posts", protectRoute, createPost);
router.delete("/:id/posts/:postId", protectRoute, deletePost);
router.put("/:id/posts/:postId/react", protectRoute, reactToPost);
export default router;
