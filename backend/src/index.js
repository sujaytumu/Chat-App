import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";

import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import groupRoutes from "./routes/group.route.js";
import pushRoutes from "./routes/push.route.js";
import callRoutes from "./routes/call.route.js";
import statusRoutes from "./routes/status.route.js";
import { app, server } from "./lib/socket.js";
import { configureWebPush } from "./lib/webPush.js";

dotenv.config();
configureWebPush();

const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

// Behind a host's proxy (Render/Railway/…) req.ip must be the real client for rate limiting
app.set("trust proxy", 1);
// Standard security headers (nosniff, HSTS, frame protection, referrer policy…).
// CSP is left to the page itself — the app loads fonts/images/CDN media.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression()); // gzip API responses for faster loads on slow connections
app.use(express.json({ limit: "18mb" })); // fits base64 image/video/document/audio payloads
app.use(cookieParser());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Brute-force protection: failed logins / signups are limited per IP, and the
// whole API gets a generous ceiling so one client can't hammer the server.
const json429 = (message) => (req, res) => res.status(429).json({ message });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: json429("Too many attempts. Try again in a few minutes."),
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: json429("Too many requests. Slow down a little."),
});
app.use("/api", apiLimiter);
const lockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: json429("Too many PIN attempts. Try again in a few minutes."),
});
app.use("/api/messages/lock", lockLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/change-password", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/status", statusRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(path.join(__dirname, "../frontend/dist"), {
      maxAge: "1d",
      index: false,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // vite output filenames are content-hashed, safe to cache hard
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (name === "sw.js" || name === "manifest.json" || name.endsWith(".html")) {
          // Not content-hashed: must always be revalidated, otherwise phones and
          // installed home-screen apps keep running an old build (and an old
          // service worker) for as long as the cache lifetime.
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

server.listen(PORT, () => {
  console.log("server is running on PORT:" + PORT);
  connectDB();
});
