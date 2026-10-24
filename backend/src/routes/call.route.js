import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getCallHistory, getIceConfig, declineCall, clearCallHistory, createCallLink, myCallLinks, getCallLink, deleteCallLink } from "../controllers/call.controller.js";

const router = express.Router();

router.get("/", protectRoute, getCallHistory);
router.delete("/", protectRoute, clearCallHistory);
router.get("/ice-config", protectRoute, getIceConfig);
router.get("/links", protectRoute, myCallLinks);
router.post("/links", protectRoute, createCallLink);
router.get("/links/:code", protectRoute, getCallLink);
router.delete("/links/:code", protectRoute, deleteCallLink);
router.post("/decline", protectRoute, declineCall);

export default router;
