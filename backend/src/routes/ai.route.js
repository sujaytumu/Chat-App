import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { aiChat, aiSuggest, aiStatus, aiRewrite } from "../controllers/ai.controller.js";

const router = express.Router();
router.get("/status", protectRoute, aiStatus);
router.post("/chat", protectRoute, aiChat);
router.post("/suggest", protectRoute, aiSuggest);
router.post("/rewrite", protectRoute, aiRewrite);
export default router;
