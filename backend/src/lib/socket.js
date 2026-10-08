import { Server } from "socket.io";
import http from "http";
import express from "express";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import CallLog from "../models/callLog.model.js";
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

// Online presence: a user can have several live sockets at once (a second tab,
// a phone + laptop, or an old socket that hasn't timed out yet while the new
// one has already reconnected). The old code kept ONE socket id per user and
// deleted it on ANY disconnect — so a reload/reconnect made an online user look
// offline: messages stayed single-tick, calls showed "Calling…" forever, and
// answer / ICE messages were dropped. Now a user is online while at least one
// socket is connected, and every targeted emit goes to the user's personal room
// (each socket joins room === userId) so all their devices get it.
const userSockets = new Map(); // userId -> Set<socketId>
const isOnline = (id) => (userSockets.get(id)?.size || 0) > 0;
const onlineIds = () => [...userSockets.keys()];
const roomFor = (id) => (isOnline(id) ? id : undefined);
const DISCONNECT_CALL_GRACE_MS = 8000;

// Calls placed to someone who isn't currently connected are held here for a
// short grace period. If they open the app (e.g. from the missed-call push
// notification) within that window, the call is delivered to them as if it
// just came in — the caller's side stays in a "ringing" state meanwhile.
// Note: this only works if they open the app within the grace period; a web
// app fundamentally can't wake a fully closed browser/phone the way a native
// VoIP push can, so this is the closest practical approximation of that.
const pendingCalls = new Map(); // toUserId -> { offer, callType, fromUser, fromUserId, timeout }
const CALL_GRACE_PERIOD_MS = 45_000;
const activeCallLogs = new Map(); // sorted pairKey -> CallLog _id
const pairKey = (a, b) => [a, b].sort().join("_");

// Returns the user's personal room name when they're online (truthy), else
// undefined. Callers do io.to(<return value>).emit(...), which reaches every
// socket the user has open.
export function getReceiverSocketId(userId) {
  return roomFor(userId);
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.join(userId); // personal room — all of this user's devices
  }

  io.emit("getOnlineUsers", onlineIds());

  // ---- Typing indicators (1:1) ----
  socket.on("typing", ({ toUserId }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { fromUserId: userId });
    }
  });

  socket.on("stopTyping", ({ toUserId }) => {
    const receiverSocketId = roomFor(toUserId);
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
  socket.on("callUser", async ({ toUserId, offer, callType, fromUser }, ack) => {
    // Never make signaling wait on the database — a slow/cold MongoDB used to
    // delay the ack past the client's timeout, which triggered duplicate
    // "callUser" retries and double-ringing / auto-reject on the callee.
    const logPromise = CallLog.create({
      callerId: userId,
      calleeId: toUserId,
      callType,
      status: "ringing",
    })
      .then((log) => {
        activeCallLogs.set(pairKey(userId, toUserId), log._id);
      })
      .catch((err) => {
        console.log("Error creating call log:", err.message);
      });
    void logPromise;

    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("incomingCall", { fromUser, offer, callType });
      if (typeof ack === "function") ack({ delivered: true });
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

    if (typeof ack === "function") ack({ delivered: false, reason: "offline" });

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
      const logId = activeCallLogs.get(pairKey(userId, toUserId));
      if (logId) {
        CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
        activeCallLogs.delete(pairKey(userId, toUserId));
      }
    }, CALL_GRACE_PERIOD_MS);

    pendingCalls.set(toUserId, { offer, callType, fromUser, fromUserId: userId, timeout });
    socket.emit("callRinging", { reason: "Waiting for them to come online" });
  });

  socket.on("answerCall", ({ toUserId, answer }, ack) => {
    socket.to(userId).emit("callEnded"); // stop ringing on my other devices
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callAnswered", { answer });
      if (typeof ack === "function") ack({ delivered: true });
    } else if (typeof ack === "function") {
      ack({ delivered: false, reason: "caller disconnected" });
    }
    const logId = activeCallLogs.get(pairKey(userId, toUserId));
    if (logId) {
      CallLog.findByIdAndUpdate(logId, { status: "answered" }).catch(() => {});
    }
  });

  // Callee's client acks that the call actually reached them and their
  // device is now audibly ringing — lets the caller's UI switch from
  // "Calling…" to "Ringing…", mirroring the sent → delivered distinction
  // used for message ticks.
  socket.on("callRingingAck", ({ toUserId }) => {
    const callerSocketId = roomFor(toUserId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("remoteDeviceRinging");
    }
  });

  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("iceCandidate", { candidate });
    }
  });

  // Mid-call renegotiation — used to upgrade a voice call to video (adding
  // a video track requires a fresh offer/answer exchange on the same
  // already-connected peer connection).
  socket.on("webrtcRenegotiate", ({ toUserId, offer }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("webrtcRenegotiateOffer", { offer });
    }
  });

  socket.on("webrtcRenegotiateAnswer", ({ toUserId, answer }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("webrtcRenegotiateAnswer", { answer });
    }
  });

  // Lets each side tell the other about its mic/camera state (muted, camera
  // off) so the call screen can show an indicator — a muted track otherwise
  // looks identical to silence. Pure relay, nothing is stored.
  socket.on("callMediaState", ({ toUserId, state }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId && state && typeof state === "object") {
      io.to(receiverSocketId).emit("remoteMediaState", {
        isMuted: !!state.isMuted,
        isVideoOff: !!state.isVideoOff,
        isScreenSharing: !!state.isScreenSharing,
      });
    }
  });

  socket.on("rejectCall", ({ toUserId }) => {
    socket.to(userId).emit("callEnded"); // stop ringing on my other devices
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callRejected");
    }
    const key = pairKey(userId, toUserId);
    const logId = activeCallLogs.get(key);
    if (logId) {
      CallLog.findByIdAndUpdate(logId, { status: "declined", endedAt: new Date() }).catch(() => {});
      activeCallLogs.delete(key);
    }
  });

  socket.on("endCall", async ({ toUserId }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded");
    }
    const key = pairKey(userId, toUserId);
    const logId = activeCallLogs.get(key);
    if (logId) {
      try {
        const log = await CallLog.findById(logId);
        if (log) {
          const endedAt = new Date();
          const wasAnswered = log.status === "answered";
          const durationSeconds = wasAnswered ? Math.round((endedAt - log.startedAt) / 1000) : 0;
          await CallLog.findByIdAndUpdate(logId, {
            status: wasAnswered ? "answered" : "missed",
            endedAt,
            durationSeconds,
          });
        }
      } catch (err) {
        console.log("Error finalizing call log:", err.message);
      }
      activeCallLogs.delete(key);
    }
  });

  socket.on("disconnect", () => {
    if (!userId) return;

    const sockets = userSockets.get(userId);
    sockets?.delete(socket.id);
    if (!sockets || sockets.size === 0) userSockets.delete(userId);
    io.emit("getOnlineUsers", onlineIds());

    // The user still has another live socket (reload, second tab, quick
    // reconnect) — they're not gone, so don't tear anything down.
    if (isOnline(userId)) return;

    // If this user stays gone (tab closed, network died) while a call
    // involving them is active or ringing, the other side would otherwise
    // never find out. Wait a short grace period first so a brief network blip
    // or reconnect doesn't kill a perfectly good call.
    setTimeout(() => {
      if (isOnline(userId)) return; // they came back

      for (const [key, logId] of activeCallLogs.entries()) {
        const [a, b] = key.split("_");
        if (a !== userId && b !== userId) continue;
        const otherId = a === userId ? b : a;
        const otherRoom = roomFor(otherId);
        if (otherRoom) {
          io.to(otherRoom).emit("callEnded");
        }
        CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
        activeCallLogs.delete(key);
      }

      // Also clear any call this user placed that's still waiting in the
      // offline-callee grace period.
      for (const [toUserId, pending] of pendingCalls.entries()) {
        if (pending.fromUserId === userId) {
          clearTimeout(pending.timeout);
          pendingCalls.delete(toUserId);
        }
      }
    }, DISCONNECT_CALL_GRACE_MS);
  });

  // ---- Everything below is background setup that does NOT need to block
  // listener registration above. This used to run before the socket.on(...)
  // calls (inside an async connection handler), which meant an event like
  // "callUser" arriving from a client while these awaits were still in
  // flight would find no listener registered yet and be silently dropped —
  // a real, structural bug, not just network flakiness. ----
  if (userId) {
    (async () => {
      // Join every group room this user belongs to, so group messages reach them
      try {
        const groups = await Group.find({ members: userId }).select("_id");
        groups.forEach((group) => socket.join(group._id.toString()));
      } catch (err) {
        console.log("Error joining group rooms:", err.message);
      }

      // Catch up delivery receipts: any direct messages sent to this user
      // while they were offline are now delivered, so flip the flag and
      // tell the senders.
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
            const senderSocketId = roomFor(senderId);
            if (senderSocketId) {
              io.to(senderSocketId).emit("messagesDelivered", { by: userId });
            }
          });
        }
      } catch (err) {
        console.log("Error catching up delivery receipts:", err.message);
      }

      // Deliver any call that was placed to this user while they were
      // offline and is still within its grace period.
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
    })();
  }
});

export { io, app, server };
