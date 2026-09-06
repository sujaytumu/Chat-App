import { Server } from "socket.io";
import http from "http";
import express from "express";
import Group from "../models/group.model.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Used to store online users: { userId: socketId }
const userSocketMap = {};

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id;

    // Join a personal room (handy for future targeted broadcasts)
    socket.join(userId);

    // Join every group room this user belongs to, so group messages reach them
    try {
      const groups = await Group.find({ members: userId }).select("_id");
      groups.forEach((group) => socket.join(group._id.toString()));
    } catch (err) {
      console.log("Error joining group rooms:", err.message);
    }
  }

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // ---- Typing indicators (1:1) ----
  socket.on("typing", ({ toUserId }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { fromUserId: userId });
    }
  });

  socket.on("stopTyping", ({ toUserId }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stopTyping", { fromUserId: userId });
    }
  });

  // ---- Typing indicators (group) ----
  socket.on("groupTyping", ({ groupId }) => {
    socket.to(groupId).emit("groupTyping", { fromUserId: userId, groupId });
  });

  socket.on("groupStopTyping", ({ groupId }) => {
    socket.to(groupId).emit("groupStopTyping", { fromUserId: userId, groupId });
  });

  // ---- WebRTC call signaling (1:1 audio/video) — pure relay, no persistence ----
  socket.on("callUser", ({ toUserId, offer, callType, fromUser }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("incomingCall", { fromUser, offer, callType });
    } else {
      socket.emit("callFailed", { reason: "User is offline" });
    }
  });

  socket.on("answerCall", ({ toUserId, answer }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callAnswered", { answer });
    }
  });

  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("iceCandidate", { candidate });
    }
  });

  socket.on("rejectCall", ({ toUserId }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callRejected");
    }
  });

  socket.on("endCall", ({ toUserId }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded");
    }
  });

  socket.on("disconnect", () => {
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
