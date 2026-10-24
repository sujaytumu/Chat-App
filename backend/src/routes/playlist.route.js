import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getPlaylist, addSong, removeSong } from "../controllers/playlist.controller.js";

const router = express.Router();
router.get("/:chatType/:chatId", protectRoute, getPlaylist);
router.post("/:chatType/:chatId", protectRoute, addSong);
router.delete("/:chatType/:chatId/:songId", protectRoute, removeSong);
export default router;
