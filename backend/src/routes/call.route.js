import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getCallHistory, getIceConfig, declineCall } from "../controllers/call.controller.js";

const router = express.Router();

router.get("/", protectRoute, getCallHistory);
router.get("/ice-config", protectRoute, getIceConfig);
router.post("/decline", protectRoute, declineCall);

export default router;
