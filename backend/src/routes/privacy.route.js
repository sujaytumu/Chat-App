import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getContentPrivacy, setContentPrivacy } from "../controllers/privacy.controller.js";

const router = express.Router();
router.get("/", protectRoute, getContentPrivacy);
router.put("/", protectRoute, setContentPrivacy);
export default router;
