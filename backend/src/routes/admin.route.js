import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { requireOwner, listAccess, setAccess } from "../controllers/admin.controller.js";

const router = express.Router();
router.get("/access", protectRoute, requireOwner, listAccess);
router.put("/access", protectRoute, requireOwner, setAccess);
export default router;
