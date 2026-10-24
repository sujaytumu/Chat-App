import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { listComments, addComment, likeComment, deleteComment } from "../controllers/statusComment.controller.js";

const router = express.Router();

router.put("/like/:commentId", protectRoute, likeComment);
router.delete("/:commentId", protectRoute, deleteComment);
router.get("/:targetId", protectRoute, listComments);
router.post("/:targetId", protectRoute, addComment);

export default router;
