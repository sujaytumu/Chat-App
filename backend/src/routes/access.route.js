import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { myRequest, requestAccess } from "../controllers/accessRequest.controller.js";

const router = express.Router();
router.get("/mine", protectRoute, myRequest);
router.post("/request", protectRoute, requestAccess);
export default router;
