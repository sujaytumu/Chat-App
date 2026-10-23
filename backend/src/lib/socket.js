import { sendFcmClearChat } from "./fcm.js";
import { canSee } from "./visibility.js";
import { maskPayload } from "./privateMedia.js";
import CallLink from "../models/callLink.model.js";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import http from "http";
import express from "express";
import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
import CallLog from "../models/callLog.model.js";
import User from "../models/user.model.js";
import { sendPushToUser, sendPushToUsers } from "./webPush.js";
import { sendFcmCancelCall } from "./fcm.js";
import { markGroupDelivered } from "./groupReceipts.js";
import { ackDirectMessage, markDirectDeliveredFor } from "./directReceipts.js";
import { recallMessage } from "./recentMessages.js";

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
// Other modules add their own per-connection handlers here (kept out of this file to avoid import cycles).
const connectionHooks = [];
export const onSocketConnection = (fn) => connectionHooks.push(fn);
export function setPrivacyCache(userId, user) {
  privacyCache.set(String(userId), {
    typing: user?.privacy?.typing !== false,
    online: user?.privacy?.online !== false,
    readReceipts: user?.privacy?.readReceipts !== false,
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
// One entry per live 1:1 call (ringing or answered). Every call gets its own id, and every signal
// about it (ring / answer / decline / end / cancel) carries that id, so a late or duplicated signal
// from an OLD call can never ring again, end or decline a different one.
const activeCalls = new Map(); // sorted pairKey -> { callId, callerId, calleeId, startedAt, answered }
const DUPLICATE_CALL_WINDOW_MS = 8000;
const newCallId = () => crypto.randomUUID();
// true when a signal that names a call id belongs to some OTHER call between the same two people
const isStaleSignal = (a, b, callId) => {
  if (!callId) return false; // old clients don't send one
  const cur = activeCalls.get(pairKey(a, b));
  return !!cur && cur.callId !== callId; // no record at all = the server restarted; let signals through
};

// ---- Group call state (see the "groupCall:*" handlers) ----
const MAX_GROUP_CALL = 10;
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
// Calls made from a call link live in the ad-hoc machinery (no Group document), under "adhoc:link-<code>".
const LINK_PREFIX = "adhoc:link-";
export const linkCallLive = (code) => groupCalls.has(`${LINK_PREFIX}${code}`);
export const linkCallCount = (code) => groupCalls.get(`${LINK_PREFIX}${code}`)?.participants.size || 0;
async function linkFor(groupId) {
  if (typeof groupId !== "string" || !groupId.startsWith(LINK_PREFIX)) return null;
  try {
    return await CallLink.findOne({ code: groupId.slice(LINK_PREFIX.length), expiresAt: { $gt: new Date() } }).lean();
  } catch {
    return null;
  }
}
const isAdhoc = (groupId) => typeof groupId === "string" && groupId.startsWith("adhoc:");

// Ad-hoc calls come from adding people to a 1:1 call: they have no Group document,
// only the list of people invited (stored on the live call itself).
const broadcastGroupCall = (groupId) => {
  const call = groupCalls.get(groupId);
  if (isAdhoc(groupId)) {
    const state = groupCallPublic(groupId);
    for (const id of call?.adhoc?.members || []) {
      const room = roomFor(id);
      if (room) io.to(room).emit("groupCall:state", state);
    }
    return;
  }
  io.to(groupId).emit("groupCall:state", groupCallPublic(groupId));
};

async function isGroupMember(groupId, userId) {
  if (isAdhoc(groupId)) return !!groupCalls.get(groupId)?.adhoc?.members.has(userId);
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
  if (call.participants.size === 0) {
    if (call.adhoc) {
      // Tell everyone invited that it's over (stops any ringing).
      for (const id of call.adhoc.members) {
        const room = roomFor(id);
        if (room) io.to(room).emit("groupCall:state", { groupId, active: false, participants: [] });
      }
    }
    groupCalls.delete(groupId);
    if (call.adhoc) return;
  }
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
    const user = await User.findById(decoded.userId).select("fullName profilePic privacy blockedUsers tokenVersion deleted sessions").lean();
    // Signed out everywhere / deleted since this login was issued -> no realtime either
    if (!user || user.deleted || (decoded.tv || 0) !== (user.tokenVersion || 0)) return next(new Error("unauthorized"));
    if (decoded.sid && Date.now() / 1000 - (decoded.iat || 0) > 20 && !(user.sessions || []).some((x) => x.sid === decoded.sid)) return next(new Error("unauthorized"));
    setPrivacyCache(user._id, user);
    socket.data.userId = String(user._id);
    socket.data.sid = decoded.sid || null;
    // Trusted identity shown to the other side of a call
    socket.data.profile = { _id: String(user._id), fullName: user.fullName, profilePic: user.profilePic };
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  for (const hook of connectionHooks) hook(socket);

  if (userId) {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.join(userId); // personal room — all of this user's devices
  }

  io.emit("getOnlineUsers", onlineIds());

  // A call placed while this person was offline / in the background is handed over the instant
  // they connect — before the slower catch-up work below — so tapping Answer on the notification
  // connects straight away instead of waiting on database queries.
  if (userId) {
    const held = pendingCalls.get(userId);
    if (held) socket.emit("incomingCall", { fromUser: held.fromUser, offer: held.offer, callType: held.callType, callId: held.callId });
  }

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

  // ---- "recording audio…" (1:1) — same rules as typing ----
  socket.on("recording", ({ toUserId }) => {
    if (privacyCache.get(userId)?.typing === false || !canSignal(userId, String(toUserId))) return;
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) io.to(receiverSocketId).emit("recording", { fromUserId: userId });
  });
  socket.on("stopRecording", ({ toUserId }) => {
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) io.to(receiverSocketId).emit("stopRecording", { fromUserId: userId });
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

  // Liveness probe from the app (after it was in the background / signal came back).
  socket.on("clientPing", (cb) => {
    if (typeof cb === "function") cb();
  });

  // The device confirms a message actually arrived -> sender gets the double tick.
  socket.on("messageReceived", async ({ messageId, groupId } = {}) => {
    try {
      if (!messageId) return;
      if (groupId) {
        await markGroupDelivered(io, userId, { messageIds: [messageId] });
      } else if (recallMessage(messageId)?.receiverId === userId) {
        // We know this message: tell the sender straight away (their double tick), save in the background.
        const m = recallMessage(messageId);
        const room = roomFor(m.senderId);
        if (room) io.to(room).emit("messagesDelivered", { by: userId });
        markDirectDeliveredFor(() => {}, userId, { senderId: m.senderId, createdAt: { $lte: m.createdAt } }, { silent: true });
      } else {
        await ackDirectMessage((uid, ev, payload) => {
          const room = roomFor(uid);
          if (room) io.to(room).emit(ev, payload);
        }, userId, messageId);
      }
    } catch (e) {
      console.log("Error in messageReceived:", e.message);
    }
  });

  // The person opened the chat / a message arrived while it is open: blue ticks for the sender. Sent over
  // the live connection and relayed at once; the database catches up right after.
  socket.on("markSeen", async ({ from } = {}) => {
    try {
      const sender = String(from || "");
      if (!/^[a-f0-9]{24}$/.test(sender) || sender === userId) return;
      const receiptsOff = privacyCache.get(userId)?.readReceipts === false || privacyCache.get(sender)?.readReceipts === false;
      if (!receiptsOff) {
        const room = roomFor(sender);
        if (room) io.to(room).emit("messagesSeen", { by: userId });
      }
      const r = await Message.updateMany({ senderId: sender, receiverId: userId, seen: false }, { $set: { seen: true, seenAt: new Date(), delivered: true } });
      if (r.modifiedCount > 0) sendFcmClearChat(userId, sender);
    } catch (e) {
      console.log("Error in markSeen:", e.message);
    }
  });

  // ---- WebRTC call signaling (1:1 audio/video) — pure relay, no persistence ----
  socket.on("callUser", async (payload, ack) => {
    try {
      await handleCallUser(payload || {}, ack);
    } catch (err) {
      console.log("Error in callUser:", err?.message);
      if (typeof ack === "function") ack({ delivered: false, reason: "error" });
    }
  });
  const handleCallUser = async ({ toUserId, offer, callType }, ack) => {
    const fromUser = socket.data.profile; // never trust a client-supplied caller identity
    let blocked = !canSignal(userId, String(toUserId)) || !(await canSee({ _id: userId }, String(toUserId))); // calls follow the same "who may see whom" rule
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
    // The same call arriving twice (a re-sent signal after a network blip) must ring ONCE: answer the
    // duplicate with the existing call instead of creating a second call, log and ring.
    const existing = activeCalls.get(callKey);
    if (existing && !existing.answered && existing.callerId === userId && Date.now() - existing.startedAt < DUPLICATE_CALL_WINDOW_MS) {
      if (typeof ack === "function") ack({ delivered: isOnline(String(toUserId)), callId: existing.callId, duplicate: true });
      return;
    }
    // A previous call between these two that never got cleaned up must not leak into this one.
    if (existing) {
      clearHeldCall(String(existing.calleeId), String(existing.callerId));
      activeCallLogs.delete(callKey);
    }
    const callId = newCallId();
    activeCalls.set(callKey, { callId, callerId: userId, calleeId: String(toUserId), startedAt: Date.now(), answered: false });
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

    // Keep the call alive on the server until the callee answers / declines / the caller hangs up.
    // If their socket was a zombie, the call is handed to them the moment they reconnect, and the push
    // wakes the phone. After CALL_GRACE_PERIOD_MS nobody picked up: it is a missed call everywhere.
    const holdForCallee = () => {
      const previous = pendingCalls.get(String(toUserId));
      if (previous) {
        // never leave an orphaned timer behind: it would later end a DIFFERENT call
        clearTimeout(previous.timeout);
        if (previous.callId !== callId) expireHeldCall(String(toUserId), previous);
      }
      const timeout = setTimeout(() => expireHeldCall(String(toUserId), entry), CALL_GRACE_PERIOD_MS);
      const entry = { offer, callType, fromUser, fromUserId: userId, callId, timeout, ice: [] };
      pendingCalls.set(String(toUserId), entry);
    };

    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("incomingCall", { fromUser, offer, callType, callId });
      if (typeof ack === "function") ack({ delivered: true, callId });
      holdForCallee(); // dropped again as soon as their device confirms it is ringing
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
        data: { url: "/", chatType: "direct", chatId: userId, callerId: userId, isCall: true, callId },
      }, CALL_PUSH_OPTIONS);
      return;
    }

    if (typeof ack === "function") ack({ delivered: false, reason: "offline", callId });

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
      data: { url: "/", chatType: "direct", chatId: userId, callerId: userId, isCall: true, callId },
    }, CALL_PUSH_OPTIONS);

    holdForCallee();
    socket.emit("callRinging", { reason: "Waiting for them to come online", callId });
  };

  // Lets each phone measure how far its clock is from the server's (see useCallStore).
  socket.on("timeSync", (ack) => {
    if (typeof ack === "function") ack(Date.now());
  });

  socket.on("answerCall", ({ toUserId, answer, callId }, ack) => {
    toUserId = String(toUserId);
    const key = pairKey(userId, toUserId);
    let cur = activeCalls.get(key);
    const held = pendingCalls.get(userId);
    const heldFromCaller = held && String(held.fromUserId) === toUserId ? held : null;
    // Answering a DIFFERENT call than the one that is live (an older ring) must not hijack the new one.
    const otherCall = (cur && callId && cur.callId !== callId) || (heldFromCaller && callId && heldFromCaller.callId !== callId);
    // Over for real: the caller hung up / it timed out / someone else already answered.
    if (otherCall || (!cur && !heldFromCaller)) {
      socket.emit("callEnded", { callId, reason: "The call had already ended" });
      if (typeof ack === "function") ack({ delivered: false, reason: "call ended" });
      return;
    }
    // The call is still ringing for this person (held for them) but its record was lost — e.g. their
    // phone's connection dropped while it rang. Picking up must still work: rebuild it.
    if (!cur) {
      cur = { callId: heldFromCaller.callId, callerId: toUserId, calleeId: userId, startedAt: Date.now(), answered: false };
      activeCalls.set(key, cur);
    }
    cur.answered = true;
    // ONE start time, decided here, that both phones show — so the two timers never differ.
    cur.answeredAt = Date.now();
    const iceBuffer = heldFromCaller?.ice || [];
    socket.to(userId).emit("callEnded", { callId: cur.callId, reason: "Answered on another device" }); // stop ringing on my other devices
    sendFcmCancelCall(userId, toUserId, cur.callId); // ...and on my Android phone(s)
    clearHeldCall(userId, toUserId);
    // The caller's network candidates sent while this phone was still asleep / not listening are
    // handed over now, so the call connects straight away instead of timing out.
    for (const candidate of iceBuffer) socket.emit("iceCandidate", { candidate });
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callAnswered", { answer, callId: cur.callId, startedAt: cur.answeredAt });
      if (typeof ack === "function") ack({ delivered: true, startedAt: cur.answeredAt });
    } else if (typeof ack === "function") {
      ack({ delivered: false, reason: "caller disconnected" });
    }
    const logId = activeCallLogs.get(key);
    if (logId) {
      CallLog.findByIdAndUpdate(logId, { status: "answered", answeredAt: new Date(cur.answeredAt) }).catch(() => {});
    }
  });

  // Callee's client acks that the call actually reached them and their
  // device is now audibly ringing — lets the caller's UI switch from
  // "Calling…" to "Ringing…", mirroring the sent → delivered distinction
  // used for message ticks.
  socket.on("callRingingAck", ({ toUserId, callId }) => {
    if (isStaleSignal(toUserId, userId, callId)) return;
    // Keep the call held (don't clear it here): the phone saying "ringing" doesn't mean the
    // person saw it. If they leave and re-open the app, "syncCalls" / reconnect hands it over again.
    const callerSocketId = roomFor(toUserId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("remoteDeviceRinging", { callId });
    }
  });

  // The app came back to the front (or the network returned): hand over any call that is
  // still ringing for this user. The client ignores a call it is already showing.
  socket.on("syncCalls", () => {
    const pending = pendingCalls.get(userId);
    if (!pending) return;
    socket.emit("incomingCall", { fromUser: pending.fromUser, offer: pending.offer, callType: pending.callType, callId: pending.callId });
  });

  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    // Candidates the caller sends while the call is still ringing may be lost (callee asleep / app
    // just starting): keep them so they can be replayed the moment the call is answered.
    const held = pendingCalls.get(String(toUserId));
    if (held && String(held.fromUserId) === userId && held.ice.length < 80) held.ice.push(candidate);
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

  socket.on("rejectCall", ({ toUserId, callId, busy }) => {
    toUserId = String(toUserId);
    const key = pairKey(userId, toUserId);
    const cur = activeCalls.get(key);
    // A late / repeated decline for a call that is already over (or an older call) is ignored: it
    // used to hang up the caller's NEXT call.
    if (isStaleSignal(userId, toUserId, callId)) {
      socket.emit("callEnded", { callId }); // make sure this device drops that old call too
      return;
    }
    const id = cur?.callId || callId;
    socket.to(userId).emit("callEnded", { callId: id }); // stop ringing on my other devices
    sendFcmCancelCall(userId, toUserId, id); // ...and on my other Android phones
    clearHeldCall(userId, toUserId);
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callRejected", { callId: id, busy: busy === true });
    }
    const logId = activeCallLogs.get(key);
    if (logId) {
      CallLog.findByIdAndUpdate(logId, { status: "declined", endedAt: new Date() }).catch(() => {});
    }
    activeCallLogs.delete(key);
    activeCalls.delete(key);
  });

  // A client reports roughly how much data its call used (bytes sent + received) once it ends.
  // Best-effort only: it never touches the call itself, and old clients simply don't send it.
  socket.on("callUsage", async ({ peerId, bytes } = {}) => {
    try {
      const n = Math.round(Number(bytes));
      if (!peerId || !Number.isFinite(n) || n <= 0 || n > 5e9) return;
      await CallLog.findOneAndUpdate(
        {
          status: "answered",
          dataBytes: 0,
          $or: [
            { callerId: userId, calleeId: peerId },
            { callerId: peerId, calleeId: userId },
          ],
        },
        { $set: { dataBytes: n } },
        { sort: { createdAt: -1 } }
      );
    } catch (err) {
      console.log("Error saving call usage:", err.message);
    }
  });

  socket.on("endCall", async ({ toUserId, callId }) => {
    toUserId = String(toUserId);
    const key = pairKey(userId, toUserId);
    const cur = activeCalls.get(key);
    // Hang-up for a call that is not the current one (late / repeated): ignore it.
    if (isStaleSignal(userId, toUserId, callId)) return;
    const id = cur?.callId || callId;
    const heldForCallee = pendingCalls.get(toUserId);
    const wasRingingForCallee =
      (!!cur && !cur.answered && cur.callerId === userId) ||
      (!!heldForCallee && String(heldForCallee.fromUserId) === userId) ||
      (!cur && !!callId); // the server forgot the call (restart): still stop the phone ringing
    clearHeldCall(toUserId, userId);
    const receiverSocketId = roomFor(toUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded", { callId: id });
    }
    // The caller gave up before anyone picked up: stop the ring on EVERY phone of the callee —
    // including a closed app, which only a push can reach.
    if (wasRingingForCallee) sendFcmCancelCall(toUserId, userId, id);
    const logId = activeCallLogs.get(key);
    activeCallLogs.delete(key);
    activeCalls.delete(key);
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
          const durationSeconds = wasAnswered ? Math.round((endedAt - (log.answeredAt || log.startedAt)) / 1000) : 0;
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
    if (groupId.startsWith(LINK_PREFIX)) {
      // Joining (or opening) a call from a link: no ringing, anyone with the link may come in.
      const link = await linkFor(groupId);
      if (!link) return reply({ ok: false, error: "This call link has expired" });
      let call = groupCalls.get(groupId);
      if (!call) {
        call = {
          callType: link.callType,
          startedBy: userId,
          startedAt: Date.now(),
          participants: new Map(),
          adhoc: { name: link.title || "Call link", members: new Set() },
          link: link.code,
        };
        groupCalls.set(groupId, call);
      }
      if (!call.participants.has(userId) && call.participants.size >= MAX_GROUP_CALL) {
        return reply({ ok: false, error: `This call is full (${MAX_GROUP_CALL} people)` });
      }
      call.adhoc.members.add(userId);
      return reply(joinGroupCall(groupId, call, userId, socket.data.profile));
    }
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
    let group;
    let memberSet;
    if (call.adhoc) {
      // Anyone the caller may call can be added to an ad-hoc call.
      const found = await User.find({ _id: { $in: userIds.filter((id) => typeof id === "string").slice(0, MAX_GROUP_CALL) } })
        .select("_id")
        .lean()
        .catch(() => []);
      memberSet = new Set(found.map((u) => String(u._id)).filter((id) => canSignal(userId, id)));
      group = { name: call.adhoc.name, groupPic: "" };
      memberSet.forEach((id) => call.adhoc.members.add(id));
    } else {
      group = await Group.findOne({ _id: groupId, members: userId }).select("name groupPic members").lean().catch(() => null);
      if (!group) return reply({ ok: false, error: "You're not in this group" });
      memberSet = new Set(group.members.map(String));
    }
    const now = Date.now();
    const targets = [...new Set(userIds.filter((id) => typeof id === "string"))]
      .filter((id) => id !== userId && memberSet.has(id) && !call.participants.has(id))
      .filter((id) => now - (lastRung.get(`${groupId}:${id}`) || 0) > 20000) // don't spam the same person
      .slice(0, Math.max(0, MAX_GROUP_CALL - call.participants.size));
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

  // Turn the 1:1 call I'm in into a group call (WhatsApp's "Add participant").
  // The other person is moved over automatically; the extra people are rung.
  socket.on("groupCall:upgrade", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { withUserId, callType, name } = payload || {};
    if (typeof withUserId !== "string" || withUserId === userId || !canSignal(userId, withUserId)) {
      return reply({ ok: false, error: "Can't add people to this call" });
    }
    const groupId = `adhoc:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const type = callType === "video" ? "video" : "audio";
    const title = (typeof name === "string" && name.trim().slice(0, 60)) || "Group call";
    const call = {
      callType: type,
      startedBy: userId,
      startedAt: Date.now(),
      participants: new Map(),
      adhoc: { name: title, members: new Set([userId, withUserId]) },
    };
    groupCalls.set(groupId, call);
    // Nobody ended up joining (e.g. the app closed mid-switch): don't leave it lingering.
    setTimeout(() => {
      const c = groupCalls.get(groupId);
      if (c && c.participants.size === 0) {
        groupCalls.delete(groupId);
      }
    }, 45000);
    const room = roomFor(withUserId);
    if (room) io.to(room).emit("groupCall:upgrade", { groupId, name: title, callType: type, from: socket.data.profile });
    reply({ ok: true, groupId, name: title, callType: type });
  });

  socket.on("groupCall:join", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const { groupId } = payload || {};
    if (typeof groupId !== "string") return reply({ ok: false, error: "Invalid group" });
    const call = groupCalls.get(groupId);
    if (!call) return reply({ ok: false, error: "This call has ended" });
    if (call.link && (await linkFor(groupId))) call.adhoc.members.add(userId); // anyone with the link may join
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
    User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(() => {});

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
        // The person being CALLED lost their connection while it is still ringing (app in the
        // background, weak network): the call is not over — their phone is ringing from the push and
        // they can still pick up. Only the caller hanging up, a decline, or the timeout end it.
        const live = activeCalls.get(key);
        if (live && !live.answered && live.calleeId === userId) continue;
        const otherId = a === userId ? b : a;
        const otherRoom = roomFor(otherId);
        if (otherRoom) {
          io.to(otherRoom).emit("callEnded");
        }
        if (logId) {
          CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
        }
        activeCallLogs.delete(key);
        activeCalls.delete(key);
      }

      // Also clear any call this user placed that's still waiting in the
      // offline-callee grace period.
      for (const [toUserId, pending] of [...pendingCalls.entries()]) {
        if (pending.fromUserId === userId) {
          clearTimeout(pending.timeout);
          pendingCalls.delete(toUserId);
          // The caller dropped off: the callee must stop ringing (open app AND closed-app phone).
          if (isOnline(toUserId)) io.to(toUserId).emit("callEnded", { callId: pending.callId });
          sendFcmCancelCall(toUserId, userId, pending.callId);
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

    })();
  }
});

// Drop the held call for `calleeId` from `callerId` (it was answered, declined, cancelled or confirmed ringing).
function clearHeldCall(calleeId, callerId) {
  const p = pendingCalls.get(String(calleeId));
  if (p && String(p.fromUserId) === String(callerId)) {
    clearTimeout(p.timeout);
    pendingCalls.delete(String(calleeId));
  }
}

// Nobody picked up in time (or a newer call replaced this one): it becomes a missed call for the
// callee on every device, the ring stops everywhere (open app, other tabs, closed Android app),
// and the caller is told there was no answer.
function expireHeldCall(calleeId, entry) {
  const current = pendingCalls.get(calleeId);
  if (current && current.callId === entry.callId) pendingCalls.delete(calleeId);
  clearTimeout(entry.timeout);
  const callerId = String(entry.fromUserId);
  const key = pairKey(callerId, calleeId);
  const live = activeCalls.get(key);
  if (live && live.callId !== entry.callId) return; // a newer call between the two is already running
  if (live && live.answered) return; // it was answered meanwhile
  const callerRoom = roomFor(callerId);
  if (callerRoom) io.to(callerRoom).emit("callFailed", { reason: "No answer", callId: entry.callId });
  if (isOnline(calleeId)) io.to(calleeId).emit("callEnded", { callId: entry.callId }); // stop it ringing on their screen
  sendFcmCancelCall(calleeId, callerId, entry.callId);
  sendPushToUser(calleeId, {
    title: entry.fromUser?.fullName || "Someone",
    body: `Missed ${entry.callType === "video" ? "video" : "voice"} call`,
    icon: entry.fromUser?.profilePic || "/icon-v2-192.png",
    tag: `incoming-call-${callerId}`,
    data: { url: "/", chatType: "direct", chatId: callerId },
  });
  const logId = activeCallLogs.get(key);
  if (logId) CallLog.findByIdAndUpdate(logId, { status: "missed", endedAt: new Date() }).catch(() => {});
  activeCallLogs.delete(key);
  activeCalls.delete(key);
}

// The Android app's push service reports that the phone is RINGING while the app is closed or in
// the background (no open socket to emit callRingingAck on): the caller's screen moves from
// "Calling…" to "Ringing…".
export function deviceRingingFor(calleeId, callerId, callId) {
  calleeId = String(calleeId);
  callerId = String(callerId);
  const held = pendingCalls.get(calleeId);
  if (!held || String(held.fromUserId) !== callerId) return false; // call over, or not for this phone
  if (callId && held.callId && String(held.callId) !== String(callId)) return false; // an older call
  const callerRoom = roomFor(callerId);
  if (callerRoom) io.to(callerRoom).emit("remoteDeviceRinging", { callId: held.callId });
  return true;
}

// "Decline" pressed on an incoming-call notification while the app is closed
// (so there is no socket to emit rejectCall on). Same effect as rejectCall.
export function declineCallFor(userId, callerId, callId) {
  const key = pairKey(userId, callerId);
  const cur = activeCalls.get(key);
  // Already over / replaced by a newer call: a late "Decline" tap must not hang that one up.
  if (cur && callId && cur.callId !== callId) return;
  const id = cur?.callId || callId;
  const pending = pendingCalls.get(userId);
  if (pending && String(pending.fromUserId) === String(callerId)) {
    clearTimeout(pending.timeout);
    pendingCalls.delete(userId);
  }
  const callerRoom = roomFor(callerId);
  if (callerRoom) io.to(callerRoom).emit("callRejected", { callId: id });
  if (isOnline(userId)) io.to(userId).emit("callEnded", { callId: id }); // stop ringing on their open devices
  sendFcmCancelCall(userId, callerId, id); // ...and on their other Android phones
  const logId = activeCallLogs.get(key);
  if (logId) {
    CallLog.findByIdAndUpdate(logId, { status: "declined", endedAt: new Date() }).catch(() => {});
  }
  activeCallLogs.delete(key);
  activeCalls.delete(key);
}

// Chat file addresses never go out over the socket either: payloads are rewritten to /api/media/… first.
{
  const origTo = io.to.bind(io);
  io.to = (...rooms) => {
    const op = origTo(...rooms);
    const emit = op.emit.bind(op);
    op.emit = (ev, ...args) => emit(ev, ...args.map(maskPayload));
    return op;
  };
  const origEmit = io.emit.bind(io);
  io.emit = (ev, ...args) => origEmit(ev, ...args.map(maskPayload));
}

export { io, app, server };
