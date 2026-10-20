import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { tokenToUrl, canAccessMedia, deliveryUrl } from "../lib/privateMedia.js";

const router = express.Router();

// Chat media. Signed in AND in the chat it belongs to — anyone else gets "not found".
router.get("/:token", protectRoute, async (req, res) => {
  try {
    const url = tokenToUrl(req.params.token);
    if (!url) return res.status(404).end();
    if (!(await canAccessMedia(req.user._id, url))) return res.status(404).end();
    const w = Math.min(parseInt(req.query.w, 10) || 0, 2400);
    res.set("Cache-Control", "private, max-age=600");
    res.set("Vary", "Cookie");
    res.redirect(302, deliveryUrl(url, { width: w || undefined }));
  } catch (e) {
    console.log("Error in media route:", e.message);
    res.status(500).end();
  }
});

export default router;
