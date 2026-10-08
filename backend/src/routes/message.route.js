import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getMessages,
  getUsersForSidebar,
  sendMessage,
  markMessagesAsSeen,
  togglePinMessage,
  deleteMessage,
  toggleStarMessage,
  getStarredMessages,
  setChatArchived,
  ackDelivered,
  setChatPinned,
  setChatMuted,
  deleteChatForMe,
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/starred/all", protectRoute, getStarredMessages);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);
router.put("/archive", protectRoute, setChatArchived);
router.post("/ack-delivered", protectRoute, ackDelivered);
router.put("/pin-chat", protectRoute, setChatPinned);
router.put("/mute-chat", protectRoute, setChatMuted);
router.delete("/chat/:chatType/:chatId", protectRoute, deleteChatForMe);
router.put("/seen/:id", protectRoute, markMessagesAsSeen);
router.put("/pin/:id", protectRoute, togglePinMessage);
router.put("/star/:id", protectRoute, toggleStarMessage);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
