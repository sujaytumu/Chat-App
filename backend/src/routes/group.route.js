import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup,
  getUserGroups,
  getGroupMessages,
  sendGroupMessage,
  addMembers,
  removeMember,
  leaveGroup,
  updateGroupInfo,
} from "../controllers/group.controller.js";

const router = express.Router();

router.get("/", protectRoute, getUserGroups);
router.post("/", protectRoute, createGroup);
router.get("/:id/messages", protectRoute, getGroupMessages);
router.post("/:id/messages", protectRoute, sendGroupMessage);
router.put("/:id", protectRoute, updateGroupInfo);
router.post("/:id/members", protectRoute, addMembers);
router.delete("/:id/members/:memberId", protectRoute, removeMember);
router.post("/:id/leave", protectRoute, leaveGroup);

export default router;
