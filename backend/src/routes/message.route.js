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
  setChatLists,
  updatePrivacy,
  setUserBlocked,
  getStorageUsage,
  exportChats,
  deleteChatForMe,
  searchMessages,
  reactToMessage,
  getChatMedia,
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/starred/all", protectRoute, getStarredMessages);
router.get("/media/:chatType/:chatId", protectRoute, getChatMedia);
router.get("/search/all", protectRoute, searchMessages);
router.put("/react/:id", protectRoute, reactToMessage);
router.get("/storage-usage", protectRoute, getStorageUsage);
router.get("/export", protectRoute, exportChats);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);
router.put("/archive", protectRoute, setChatArchived);
router.post("/ack-delivered", protectRoute, ackDelivered);
router.put("/pin-chat", protectRoute, setChatPinned);
router.put("/mute-chat", protectRoute, setChatMuted);
router.put("/chat-lists", protectRoute, setChatLists);
router.put("/privacy", protectRoute, updatePrivacy);
router.put("/block-user", protectRoute, setUserBlocked);
router.delete("/chat/:chatType/:chatId", protectRoute, deleteChatForMe);
router.put("/seen/:id", protectRoute, markMessagesAsSeen);
router.put("/pin/:id", protectRoute, togglePinMessage);
router.put("/star/:id", protectRoute, toggleStarMessage);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
