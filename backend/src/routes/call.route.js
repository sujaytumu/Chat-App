import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getCallHistory } from "../controllers/call.controller.js";

const router = express.Router();

router.get("/", protectRoute, getCallHistory);

export default router;
