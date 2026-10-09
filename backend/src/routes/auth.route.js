import express from "express";
import { changePassword, checkAuth, login, logout, signup, updateProfile, getUiPrefs, updateUiPrefs } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

router.put("/update-profile", protectRoute, updateProfile);
router.put("/change-password", protectRoute, changePassword);

router.get("/check", protectRoute, checkAuth);

router.get("/ui-prefs", protectRoute, getUiPrefs);
router.put("/ui-prefs", protectRoute, updateUiPrefs);

export default router;
