import express from "express";
import { changePassword, checkAuth, login, logout, signup, updateProfile, getPreferences, updatePreferences, logoutAllDevices,
  listSessions,
  endSession, deleteAccount, restoreAccount, qrNew, qrPoll, qrLookup, qrApprove, checkUsername, setUsername, findByUsername, getQuietHours, setQuietHours } from "../controllers/auth.controller.js";
import {
  loginWithTwoFactor,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  twoFactorStatus,
} from "../controllers/twofactor.controller.js";
import { forgotPassword, verifyResetCode, resetPassword, ownerRecovery } from "../controllers/passwordReset.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/owner-recovery", ownerRecovery);
router.post("/forgot-password", forgotPassword);
router.post("/forgot-password/verify", verifyResetCode);
router.post("/forgot-password/reset", resetPassword);
router.post("/logout", logout);
router.post("/restore", restoreAccount);
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
router.get("/username/check", protectRoute, checkUsername);
router.put("/username", protectRoute, setUsername);
router.get("/u/:username", protectRoute, findByUsername);
router.put("/change-password", protectRoute, changePassword);
router.post("/logout-all", protectRoute, logoutAllDevices);
router.get("/sessions", protectRoute, listSessions);
router.delete("/sessions/:sid", protectRoute, endSession);
router.delete("/account", protectRoute, deleteAccount);
router.get("/quiet-hours", protectRoute, getQuietHours);
router.put("/quiet-hours", protectRoute, setQuietHours);

router.get("/check", protectRoute, checkAuth);
router.get("/preferences", protectRoute, getPreferences);
router.put("/preferences", protectRoute, updatePreferences);

export default router;
