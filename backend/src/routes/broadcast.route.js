import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { listBroadcasts, createBroadcast, updateBroadcast, deleteBroadcast } from "../controllers/broadcast.controller.js";

const router = express.Router();
router.get("/", protectRoute, listBroadcasts);
router.post("/", protectRoute, createBroadcast);
router.put("/:id", protectRoute, updateBroadcast);
router.delete("/:id", protectRoute, deleteBroadcast);
export default router;
