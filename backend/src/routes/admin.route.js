import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { requireOwner, listAccess, setAccess, setAccessKind, clearAccess, resetUserPassword, deleteUserByOwner } from "../controllers/admin.controller.js";
import { listRequests, decideRequest } from "../controllers/accessRequest.controller.js";

const router = express.Router();
router.get("/access", protectRoute, requireOwner, listAccess);
router.put("/access", protectRoute, requireOwner, setAccess);
router.put("/access/kind", protectRoute, requireOwner, setAccessKind);
router.put("/access/clear", protectRoute, requireOwner, clearAccess);
router.post("/users/:id/reset-password", protectRoute, requireOwner, resetUserPassword);
router.delete("/users/:id", protectRoute, requireOwner, deleteUserByOwner);
router.get("/requests", protectRoute, requireOwner, listRequests);
router.put("/requests/:userId", protectRoute, requireOwner, decideRequest);
export default router;
