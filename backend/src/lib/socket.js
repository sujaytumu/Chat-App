import { Server } from "socket.io";
import http from "http";
import express from "express";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import { sendPushToUser } from "./webPush.js";

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
  // Detect a dead/stalled connection (common on free-tier proxies that can
  // silently drop idle connections) much faster than the 45s default, so
  // reconnection — and the resync that follows it — kicks in quickly instead
  // of messages appearing to silently stall.
  pingInterval: 10000,
  pingTimeout: 8000,
});

// Used to store online users: { userId: socketId }
const userSocketMap = {};

// Calls placed to someone who isn't currently connected are held here for a
// short grace period. If they open the app (e.g. from the missed-call push
// notification) within that window, the call is delivered to them as if it
// just came in — the caller's side stays in a "ringing" state meanwhile.
// Note: this only works if they open the app within the grace period; a web
// app fundamentally can't wake a fully closed browser/phone the way a native
// VoIP push can, so this is the closest practical approximation of that.
const pendingCalls = new Map(); // toUserId -> { offer, callType, fromUser, fromUserId, timeout }
const CALL_GRACE_PERIOD_MS = 45_000;

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

    // Catch up delivery receipts: any direct messages sent to this user while
    // they were offline are now delivered, so flip the flag and tell the senders.
    try {
      const undelivered = await Message.find({
        receiverId: userId,
        groupId: null,
        delivered: false,
      }).select("_id senderId");

      if (undelivered.length > 0) {
        await Message.updateMany(
          { _id: { $in: undelivered.map((m) => m._id) } },
          { $set: { delivered: true } }
        );
        const senderIds = [...new Set(undelivered.map((m) => m.senderId.toString()))];
        senderIds.forEach((senderId) => {
          const senderSocketId = userSocketMap[senderId];
          if (senderSocketId) {
            io.to(senderSocketId).emit("messagesDelivered", { by: userId });
          }
        });
      }
    } catch (err) {
      console.log("Error catching up delivery receipts:", err.message);
    }

    // Deliver any call that was placed to this user while they were offline
    // and is still within its grace period.
    const pending = pendingCalls.get(userId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingCalls.delete(userId);
      socket.emit("incomingCall", {
        fromUser: pending.fromUser,
        offer: pending.offer,
        callType: pending.callType,
      });
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
      // Also push a system-level notification. Browsers block Web Audio
      // playback until a user gesture has happened on the page, so if the
      // person hasn't tapped/clicked recently, the in-app ringtone can be
      // silent — a push notification's sound comes from the OS, not the
      // page, and isn't subject to that restriction.
      sendPushToUser(toUserId, {
        title: `${fromUser?.fullName || "Someone"} is calling…`,
        body: callType === "video" ? "Incoming video call" : "Incoming voice call",
        icon: fromUser?.profilePic || "/icon-v2-192.png",
        tag: `incoming-call-${userId}`,
        data: { url: "/", chatType: "direct", chatId: userId },
      });
      return;
    }

    // Not connected right now — push a notification and hold the call for a
    // short grace period in case they open the app in time. Tell the caller
    // we're "ringing" rather than failing immediately.
    sendPushToUser(toUserId, {
      title: fromUser?.fullName || "Someone",
      body: `Incoming ${callType === "video" ? "video" : "voice"} call`,
      icon: fromUser?.profilePic || "/icon-v2-192.png",
      tag: `call-${userId}`,
      data: { url: "/", chatType: "direct", chatId: userId },
    });

    const timeout = setTimeout(() => {
      pendingCalls.delete(toUserId);
      socket.emit("callFailed", { reason: "No answer" });
      sendPushToUser(toUserId, {
        title: fromUser?.fullName || "Someone",
        body: `Missed ${callType === "video" ? "video" : "voice"} call`,
        icon: fromUser?.profilePic || "/icon-v2-192.png",
        tag: `call-${userId}`,
        data: { url: "/", chatType: "direct", chatId: userId },
      });
    }, CALL_GRACE_PERIOD_MS);

    pendingCalls.set(toUserId, { offer, callType, fromUser, fromUserId: userId, timeout });
    socket.emit("callRinging", { reason: "Waiting for them to come online" });
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
