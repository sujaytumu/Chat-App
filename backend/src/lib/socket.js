import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import http from "http";
import express from "express";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import CallLog from "../models/callLog.model.js";
import User from "../models/user.model.js";
import { sendPushToUser, sendPushToUsers } from "./webPush.js";
import { markGroupDelivered } from "./groupReceipts.js";

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
// Per-user privacy kept in memory for connected users: { typing, online, blocked:Set }
const privacyCache = new Map();
export function setPrivacyCache(userId, user) {
  privacyCache.set(String(userId), {
    typing: user?.privacy?.typing !== false,
    online: user?.privacy?.online !== false,
    blocked: new Set((user?.blockedUsers || []).map(String)),
  });
}
export const refreshOnline = () => io.emit("getOnlineUsers", onlineIds());
// People who hid their online status are left out of the list others receive.
const onlineIds = () => [...userSockets.keys()].filter((id) => privacyCache.get(id)?.online !== false);
const canSignal = (from, to) => !privacyCache.get(to)?.blocked.has(from) && !privacyCache.get(from)?.blocked.has(to);
const roomFor = (id) => (isOnline(id) ? id : undefined);
const DISCONNECT_CALL_GRACE_MS = 8000;

// Incoming-call push: Answer / Decline buttons on the notification, delivered
// at high priority with a short lifetime (a ringing call that nobody saw within
// a minute is stale).
const CALL_PUSH_ACTIONS = [
  { action: "answer", title: "Answer" },
  { action: "decline", title: "Decline" },
];
const CALL_PUSH_OPTIONS = { urgency: "high", TTL: 60 };

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

// ---- Group call state (see the "groupCall:*" handlers) ----
const MAX_GROUP_CALL = 6;
const groupCalls = new Map(); // groupId -> { callType, startedBy, startedAt, participants: Map<userId, profile> }

const groupCallPublic = (groupId) => {
  const c = groupCalls.get(groupId);
  if (!c) return { groupId, active: false, participants: [] };
  return {
    groupId,
    active: true,
    callType: c.callType,
    startedBy: c.startedBy,
    startedAt: c.startedAt,
    participants: [...c.participants.values()],
  };
};
const broadcastGroupCall = (groupId) => io.to(groupId).emit("groupCall:state", groupCallPublic(groupId));

async function isGroupMember(groupId, userId) {
  try {
    return !!(await Group.exists({ _id: groupId, members: userId }));
  } catch {
    return false;
  }
}

// Adds the socket's user to the call and tells everyone already in it.
function joinGroupCall(groupId, call, userId, profile) {
  const already = call.participants.has(userId);
  call.participants.set(userId, profile);
  if (!already) {
    for (const id of call.participants.keys()) {
      if (id === userId) continue;
      const room = roomFor(id);
      if (room) io.to(room).emit("groupCall:joined", { groupId, user: profile });
    }
  }
  broadcastGroupCall(groupId);
  return {
    ok: true,
    callType: call.callType,
    startedAt: call.startedAt,
    participants: [...call.participants.values()].filter((p) => p._id !== userId),
  };
}

function removeFromGroupCall(groupId, userId) {
  const call = groupCalls.get(groupId);
  if (!call || !call.participants.has(userId)) return;
  call.participants.delete(userId);
  for (const id of call.participants.keys()) {
    const room = roomFor(id);
    if (room) io.to(room).emit("groupCall:left", { groupId, userId });
  }
  if (call.participants.size === 0) groupCalls.delete(groupId);
  broadcastGroupCall(groupId);
}

function leaveAllGroupCalls(userId) {
  for (const groupId of [...groupCalls.keys()]) removeFromGroupCall(groupId, userId);
}

// Returns the user's personal room name when they're online (truthy), else
// undefined. Callers do io.to(<return value>).emit(...), which reaches every
// socket the user has open.
export function getReceiverSocketId(userId) {
  return roomFor(userId);
}

// Who is connecting is decided by the signed login cookie — never by anything
// the browser claims. (It used to trust ?userId=..., so anyone could connect as
// someone else: read their calls/typing, make calls "from" them, etc.)
io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.headers.cookie || "";
    const pair = raw
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("jwt="));
    if (!pair) return next(new Error("unauthorized"));
    const decoded = jwt.verify(decodeURIComponent(pair.slice(4)), process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("fullName profilePic privacy blockedUsers").lean();
    if (!user) return next(new Error("unauthorized"));
    setPrivacyCache(user._id, user);
    socket.data.userId = String(user._id);
    // Trusted identity shown to the other side of a call
    socket.data.profile = { _id: String(user._id), fullName: user.fullName, profilePic: user.profilePic };
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  if (userId) {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.join(userId); // personal room — all of this user's devices
  }

  io.emit("getOnlineUsers", onlineIds());

  // ---- Typing indicators (1:1) ----
  socket.on("typing", ({ toUserId }) => {
    if (privacyCache.get(userId)?.typing === false || !canSignal(userId, String(toUserId))) return;
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
    if (!socket.rooms.has(String(groupId))) return;
    socket.to(groupId).emit("groupTyping", { fromUserId: userId, groupId });
  });

  socket.on("groupStopTyping", ({ groupId }) => {
    if (!socket.rooms.has(String(groupId))) return;
    socket.to(groupId).emit("groupStopTyping", { fromUserId: userId, groupId });
  });

  // ---- WebRTC call signaling (1:1 audio/video) — pure relay, no persistence ----
  socket.on("callUser", async ({ toUserId, offer, callType }, ack) => {
    const fromUser = socket.data.profile; // never trust a client-supplied caller identity
    let blocked = !canSignal(userId, String(toUserId));
    if (!blocked && !isOnline(String(toUserId))) {
      // Offline callee isn't in the cache — one quick lookup before we push-notify them.
      const target = await User.findById(toUserId).select("blockedUsers").lean().catch(() => null);
      blocked = !!target?.blockedUsers?.some((b) => String(b) === userId);
    }
    if (blocked) {
      if (typeof ack === "function") ack({ delivered: false, reason: "blocked" });
      return;
    }
    // Never make signaling wait on the database — a slow/cold MongoDB used to
    // delay the ack past the client's timeout, which triggered duplicate
    // "callUser" retries and double-ringing / auto-reject on the callee.
    const callKey = pairKey(userId, toUserId);
    activeCallLogs.set(callKey, null); // tracked right away, DB id attached below
    const logPromise = CallLog.create({
      callerId: userId,
      calleeId: toUserId,
      callType,
      status: "ringing",
    })
      .then((log) => {
        if (activeCallLogs.has(callKey)) {
          activeCallLogs.set(callKey, log._id);
        } else {
          // call already ended before the log was written
          CallLog.findByIdAndUpdate(log._id, { status: "missed", endedAt: new Date() }).catch(() => {});
        }
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
        isCall: true,
        actions: CALL_PUSH_ACTIONS,
        tag: `incoming-call-${userId}`,
        data: { url: "/", chatType: "direct", chatId: userId, callerId: userId, isCall: true },
      }, CALL_PUSH_OPTIONS);
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
      isCall: true,
      actions: CALL_PUSH_ACTIONS,
      tag: `incoming-call-${userId}`,
      data: { url: "/", chatType: "direct", chatId: userId, callerId: userId, isCall: true },
    }, CALL_PUSH_OPTIONS);

    const timeout = setTimeout(() => {
      pendingCalls.delete(toUserId);
      socket.emit("callFailed", { reason: "No answer" });
      sendPushToUser(toUserId, {
        title: fromUser?.fullName || "Someone",
        body: `Missed ${callType === "video" ? "video" : "voice"} call`,
        icon: fromUser?.profilePic || "/icon-v2-192.png",
        tag: `incoming-call-${userId}`,
        data: { url: "/", chatType: "direct", chatId: userId },
      });
      const logId = activeCallLogs.get(pairKey(userId, toUserId));
      if (logId) {
        CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
      }
      activeCallLogs.delete(pairKey(userId, toUserId));
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
        hasCamera: state.hasCamera !== false,
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
    }
    activeCallLogs.delete(key);
  });

  socket.on("endCall", async ({ toUserId }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded");
    }
    const key = pairKey(userId, toUserId);
    const logId = activeCallLogs.get(key);
    activeCallLogs.delete(key);
    if (logId) {
      try {
        const log = await CallLog.findById(logId);
        if (log) {
          const endedAt = new Date();
          const wasAnswered = log.status === "answered";
          if (!wasAnswered && String(log.callerId) === String(userId)) {
            // The caller gave up before it was answered — turn the callee's
            // ringing notification into a "Missed call" one (same tag).
            User.findById(userId)
              .select("fullName profilePic")
              .then((caller) => {
                sendPushToUser(toUserId, {
                  title: caller?.fullName || "Someone",
                  body: `Missed ${log.callType === "video" ? "video" : "voice"} call`,
                  icon: caller?.profilePic || "/icon-v2-192.png",
                  tag: `incoming-call-${userId}`,
                  data: { url: "/", chatType: "direct", chatId: String(userId) },
                }, { urgency: "high", TTL: 60 * 60 * 24 });
              })
              .catch(() => {});
          }
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
    }
  });

  // ---- Group calls ----
  // Mesh WebRTC: every participant connects directly to every other one, so the
  // server only relays signalling (offers / answers / ICE) and tracks who is in
  // which call. Members only; at most MAX_GROUP_CALL people per call.
  socket.on("groupCall:start", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { groupId, callType } = payload || {};
    if (typeof groupId !== "string") return reply({ ok: false, error: "Invalid group" });
    const group = await Group.findOne({ _id: groupId, members: userId })
      .select("name groupPic members")
      .lean()
      .catch(() => null);
    if (!group) return reply({ ok: false, error: "You're not in this group" });

    const existing = groupCalls.get(groupId);
    if (existing) {
      // Someone already started one — starting is just joining it.
      if (!existing.participants.has(userId) && existing.participants.size >= MAX_GROUP_CALL) {
        return reply({ ok: false, error: `This call is full (${MAX_GROUP_CALL} people)` });
      }
      return reply(joinGroupCall(groupId, existing, userId, socket.data.profile));
    }

    const type = callType === "video" ? "video" : "audio";
    const call = { callType: type, startedBy: userId, startedAt: Date.now(), participants: new Map() };
    groupCalls.set(groupId, call);
    call.participants.set(userId, socket.data.profile);

    const others = group.members.map(String).filter((m) => m !== userId);
    others.forEach((memberId) => {
      const room = roomFor(memberId);
      if (room) {
        io.to(room).emit("groupCall:incoming", {
          groupId,
          groupName: group.name,
          groupPic: group.groupPic || "",
          callType: type,
          from: socket.data.profile,
        });
      }
    });
    sendPushToUsers(
      others,
      {
        title: group.name,
        body: `${socket.data.profile?.fullName || "Someone"} started a group ${type === "video" ? "video" : "voice"} call`,
        icon: group.groupPic || "/icon-v2-192.png",
        isCall: true,
        tag: `group-call-${groupId}`,
        data: { url: "/", chatType: "group", chatId: groupId },
      },
      CALL_PUSH_OPTIONS,
      `g:${groupId}`
    );
    broadcastGroupCall(groupId);
    reply({ ok: true, callType: type, participants: [] });
  });

  // Someone already in a group call rings other members of the group to join
  // (the WhatsApp "Add participant" flow).
  const lastRung = (socket.data.lastRung = socket.data.lastRung || new Map());
  socket.on("groupCall:ring", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { groupId, userIds } = payload || {};
    if (typeof groupId !== "string" || !Array.isArray(userIds)) return reply({ ok: false, error: "Invalid request" });
    const call = groupCalls.get(groupId);
    if (!call || !call.participants.has(userId)) return reply({ ok: false, error: "You're not in this call" });
    const group = await Group.findOne({ _id: groupId, members: userId }).select("name groupPic members").lean().catch(() => null);
    if (!group) return reply({ ok: false, error: "You're not in this group" });

    const memberSet = new Set(group.members.map(String));
    const now = Date.now();
    const targets = [...new Set(userIds.filter((id) => typeof id === "string"))]
      .filter((id) => id !== userId && memberSet.has(id) && !call.participants.has(id))
      .filter((id) => now - (lastRung.get(`${groupId}:${id}`) || 0) > 20000) // don't spam the same person
      .slice(0, MAX_GROUP_CALL);
    if (!targets.length) return reply({ ok: true, rung: [] });

    targets.forEach((id) => {
      lastRung.set(`${groupId}:${id}`, now);
      const room = roomFor(id);
      if (room) {
        io.to(room).emit("groupCall:incoming", {
          groupId,
          groupName: group.name,
          groupPic: group.groupPic || "",
          callType: call.callType,
          from: socket.data.profile,
        });
      }
    });
    sendPushToUsers(
      targets,
      {
        title: group.name,
        body: `${socket.data.profile?.fullName || "Someone"} is calling you to join a group ${call.callType === "video" ? "video" : "voice"} call`,
        icon: group.groupPic || "/icon-v2-192.png",
        isCall: true,
        tag: `group-call-${groupId}`,
        data: { url: "/", chatType: "group", chatId: groupId },
      },
      CALL_PUSH_OPTIONS,
      `g:${groupId}`
    );
    reply({ ok: true, rung: targets });
  });

  socket.on("groupCall:join", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { groupId } = payload || {};
    if (typeof groupId !== "string") return reply({ ok: false, error: "Invalid group" });
    const call = groupCalls.get(groupId);
    if (!call) return reply({ ok: false, error: "This call has ended" });
    if (!(await isGroupMember(groupId, userId))) return reply({ ok: false, error: "You're not in this group" });
    if (!groupCalls.has(groupId)) return reply({ ok: false, error: "This call has ended" });
    if (!call.participants.has(userId) && call.participants.size >= MAX_GROUP_CALL) {
      return reply({ ok: false, error: `This call is full (${MAX_GROUP_CALL} people)` });
    }
    reply(joinGroupCall(groupId, call, userId, socket.data.profile));
  });

  // Relay one signalling message to another participant of the same call.
  socket.on("groupCall:signal", (payload) => {
    const { groupId, toUserId, data } = payload || {};
    const call = typeof groupId === "string" ? groupCalls.get(groupId) : null;
    if (!call || typeof toUserId !== "string" || !data || typeof data !== "object") return;
    if (!call.participants.has(userId) || !call.participants.has(toUserId)) return;
    const room = roomFor(toUserId);
    if (room) io.to(room).emit("groupCall:signal", { groupId, fromUserId: userId, data });
  });

  // Mic / camera / screen-share state, so everyone's tiles stay accurate.
  socket.on("groupCall:media", (payload) => {
    const { groupId, state } = payload || {};
    const call = typeof groupId === "string" ? groupCalls.get(groupId) : null;
    if (!call || !call.participants.has(userId) || !state) return;
    const clean = { muted: !!state.muted, videoOff: !!state.videoOff, screen: !!state.screen };
    for (const id of call.participants.keys()) {
      if (id === userId) continue;
      const room = roomFor(id);
      if (room) io.to(room).emit("groupCall:media", { groupId, userId, state: clean });
    }
  });

  socket.on("groupCall:leave", ({ groupId } = {}) => {
    if (typeof groupId === "string") removeFromGroupCall(groupId, userId);
  });

  // Declined on this device: stop the ring on the person's other devices too.
  socket.on("groupCall:decline", ({ groupId } = {}) => {
    if (typeof groupId === "string") io.to(userId).emit("groupCall:dismiss", { groupId });
  });

  socket.on("groupCall:query", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { groupId } = payload || {};
    if (typeof groupId !== "string" || !(await isGroupMember(groupId, userId))) return reply({ active: false });
    reply(groupCallPublic(groupId));
  });

  socket.on("disconnect", () => {
    if (!userId) return;

    const sockets = userSockets.get(userId);
    sockets?.delete(socket.id);
    if (!sockets || sockets.size === 0) {
      userSockets.delete(userId);
      privacyCache.delete(userId);
    }
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
      leaveAllGroupCalls(userId);

      for (const [key, logId] of activeCallLogs.entries()) {
        const [a, b] = key.split("_");
        if (a !== userId && b !== userId) continue;
        const otherId = a === userId ? b : a;
        const otherRoom = roomFor(otherId);
        if (otherRoom) {
          io.to(otherRoom).emit("callEnded");
        }
        if (logId) {
          CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
        }
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
        // Calls already running in their groups (shows the "Join" bar)
        const running = groups.map((g) => g._id.toString()).filter((id) => groupCalls.has(id)).map(groupCallPublic);
        if (running.length) socket.emit("groupCall:states", running);
        // Group messages sent while they were offline are now delivered
        if (groups.length) markGroupDelivered(io, userId, { groupIds: groups.map((g) => g._id) });
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

// "Decline" pressed on an incoming-call notification while the app is closed
// (so there is no socket to emit rejectCall on). Same effect as rejectCall.
export function declineCallFor(userId, callerId) {
  const pending = pendingCalls.get(userId);
  if (pending && pending.fromUserId === callerId) {
    clearTimeout(pending.timeout);
    pendingCalls.delete(userId);
  }
  const callerRoom = roomFor(callerId);
  if (callerRoom) io.to(callerRoom).emit("callRejected");
  if (isOnline(userId)) io.to(userId).emit("callEnded"); // stop ringing on their open devices
  const key = pairKey(userId, callerId);
  const logId = activeCallLogs.get(key);
  if (logId) {
    CallLog.findByIdAndUpdate(logId, { status: "declined", endedAt: new Date() }).catch(() => {});
  }
  activeCallLogs.delete(key);
}

export { io, app, server };
