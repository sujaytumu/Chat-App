import express from "express";
import { changePassword, checkAuth, login, logout, signup, updateProfile, getPreferences, updatePreferences } from "../controllers/auth.controller.js";
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
router.get("/2fa/status", protectRoute, twoFactorStatus);
router.post("/2fa/setup", protectRoute, setupTwoFactor);
router.post("/2fa/enable", protectRoute, enableTwoFactor);
router.post("/2fa/disable", protectRoute, disableTwoFactor);
router.post("/2fa/backup-codes", protectRoute, regenerateBackupCodes);

router.put("/update-profile", protectRoute, updateProfile);
router.put("/change-password", protectRoute, changePassword);

router.get("/check", protectRoute, checkAuth);
router.get("/preferences", protectRoute, getPreferences);
router.put("/preferences", protectRoute, updatePreferences);

export default router;
