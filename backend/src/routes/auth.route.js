import express from "express";
import { changePassword, checkAuth, login, logout, signup, updateProfile, getPreferences, updatePreferences, logoutAllDevices,
  listSessions,
  endSession, deleteAccount, qrNew, qrPoll, qrLookup, qrApprove } from "../controllers/auth.controller.js";
import {
  loginWithTwoFactor,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  twoFactorStatus,
} from "../controllers/twofactor.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/login/2fa", loginWithTwoFactor);
router.post("/qr/new", qrNew);
router.post("/qr/poll", qrPoll);
router.get("/qr/info/:code", protectRoute, qrLookup);
router.post("/qr/approve", protectRoute, qrApprove);
router.get("/2fa/status", protectRoute, twoFactorStatus);
router.post("/2fa/setup", protectRoute, setupTwoFactor);
router.post("/2fa/enable", protectRoute, enableTwoFactor);
router.post("/2fa/disable", protectRoute, disableTwoFactor);
router.post("/2fa/backup-codes", protectRoute, regenerateBackupCodes);

router.put("/update-profile", protectRoute, updateProfile);
router.put("/change-password", protectRoute, changePassword);
router.post("/logout-all", protectRoute, logoutAllDevices);
router.get("/sessions", protectRoute, listSessions);
router.delete("/sessions/:sid", protectRoute, endSession);
router.delete("/account", protectRoute, deleteAccount);

router.get("/check", protectRoute, checkAuth);
router.get("/preferences", protectRoute, getPreferences);
router.put("/preferences", protectRoute, updatePreferences);

export default router;
