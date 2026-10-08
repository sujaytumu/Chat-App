import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
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

app.use(compression()); // gzip API responses for faster loads on slow connections
app.use(express.json({ limit: "18mb" })); // fits base64 image/video/document/audio payloads
app.use(cookieParser());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

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
