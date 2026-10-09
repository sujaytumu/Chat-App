import { canCaptureScreen, getScreenTrack, noScreenShareMessage } from "../lib/screenCapture";
import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { useCallStore, getIceConfig } from "./useCallStore";
import { startRingtone, stopRingtoneSound, primeAudio, shouldLeaveToSystemAlert } from "../lib/notificationSound";
import { setGroupCallBusy } from "../lib/callBusy";

// Group calls (up to MAX people): every participant connects straight to every
// other one (mesh WebRTC). The server only relays signalling and keeps track
// of who is in the call. Offer/answer collisions are handled with the standard
// "perfect negotiation" pattern, so anyone can add or drop camera / screen
// share at any moment without the two sides talking over each other.

export const MAX_GROUP_CALL = 6;
const RING_MS = 40_000;
const NO_ONE_JOINED_MS = 60_000;

// Laptop browsers (getDisplayMedia) and the Talkies Android app (native capture).
export const canShareScreen = () => canCaptureScreen();

// ---- Live objects (not React state) ----
const peers = new Map(); // userId -> { pc, makingOffer, ignoreOffer, polite, candidates, stream, videoSender, attached, restarted }
let localStream = null; // microphone (+ camera when the call started as video)
let cameraTrack = null;
let screenTrack = null;
let camOn = false;
let iceCfg = null;
let ringTimer = null;
let aloneTimer = null;
let hadOthers = false;

const gum = (constraints) => navigator.mediaDevices.getUserMedia(constraints);

async function getMedia(callType) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls need a secure (https) connection");
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (callType === "video") {
    try {
      return await gum({ audio, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    } catch {
      toast("Camera unavailable — joining with audio only", { icon: "📷" });
    }
  }
  return gum({ audio });
}

const outboundVideoTrack = () => screenTrack || (camOn ? cameraTrack : null);

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: "The server didn't respond — try again" });
      }
    }, 10_000);
    socket.emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(res);
    });
  });

const initial = {
  status: "idle", // idle | joining | active
  groupId: null,
  groupName: "",
  groupPic: "",
  callType: "audio",
  startedAt: null,
  tiles: {}, // userId -> { profile, stream, muted, videoOff, screen, connected, rev }
  localVideo: null,
  isMuted: false,
  cameraOn: false,
  cameraFacing: "user", // "user" = front camera, "environment" = back
  isScreenSharing: false,
};

export const useGroupCallStore = create((set, get) => {
  const patchTile = (userId, patch) =>
    set((s) => ({ tiles: { ...s.tiles, [userId]: { ...(s.tiles[userId] || {}), ...patch } } }));

  const socketOf = () => useAuthStore.getState().socket;

  const sendSignal = (toUserId, data) => {
    const { groupId } = get();
    socketOf()?.emit("groupCall:signal", { groupId, toUserId, data });
  };

  const sendMedia = () => {
    const { groupId, status, isMuted } = get();
    if (status !== "active") return;
    socketOf()?.emit("groupCall:media", {
      groupId,
      state: { muted: isMuted, videoOff: !outboundVideoTrack(), screen: !!screenTrack },
    });
  };

  const updateLocalVideo = () => {
    const t = outboundVideoTrack();
    set({ localVideo: t ? new MediaStream([t]) : null, cameraOn: camOn, isScreenSharing: !!screenTrack });
  };

  // Put the right outgoing video (camera / screen / nothing) on every connection.
  const applyOutboundVideo = () => {
    const v = outboundVideoTrack();
    peers.forEach((rec) => {
      if (rec.videoSender) rec.videoSender.replaceTrack(v).catch(() => {});
      else if (v && localStream) rec.videoSender = rec.pc.addTrack(v, localStream);
    });
    updateLocalVideo();
    sendMedia();
  };

  const attachLocalTracks = (rec) => {
    if (rec.attached || !localStream) return;
    rec.attached = true;
    const audio = localStream.getAudioTracks()[0];
    if (audio) rec.pc.addTrack(audio, localStream);
    const v = outboundVideoTrack();
    if (v) rec.videoSender = rec.pc.addTrack(v, localStream);
  };

  const createPeer = (userId, addTracks) => {
    if (peers.has(userId)) return peers.get(userId);
    const myId = String(useAuthStore.getState().authUser?._id);
    const pc = new RTCPeerConnection(iceCfg || undefined);
    const rec = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite: myId > String(userId), // exactly one side of every pair is "polite"
      candidates: [],
      stream: null,
      videoSender: null,
      attached: false,
      restarted: false,
    };
    peers.set(userId, rec);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(userId, { candidate: e.candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        rec.makingOffer = true;
        await pc.setLocalDescription();
        sendSignal(userId, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      } catch {
        /* retried on the next negotiationneeded */
      } finally {
        rec.makingOffer = false;
      }
    };
    pc.ontrack = (e) => {
      let stream = e.streams[0];
      if (!stream) {
        rec.stream = rec.stream || new MediaStream();
        rec.stream.addTrack(e.track);
        stream = rec.stream;
      }
      rec.stream = stream;
      patchTile(userId, { stream, rev: Date.now() });
      e.track.onunmute = () => patchTile(userId, { rev: Date.now() });
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") patchTile(userId, { connected: true });
      else if (st === "failed") {
        patchTile(userId, { connected: false });
        if (!rec.restarted) {
          rec.restarted = true;
          try {
            pc.restartIce();
          } catch {
            /* ignore */
          }
        }
      } else if (st === "disconnected") patchTile(userId, { connected: false });
    };

    if (addTracks) attachLocalTracks(rec);
    return rec;
  };

  const removePeer = (userId) => {
    const rec = peers.get(userId);
    if (rec) {
      try {
        rec.pc.close();
      } catch {
        /* ignore */
      }
      peers.delete(userId);
    }
    set((s) => {
      const tiles = { ...s.tiles };
      delete tiles[userId];
      return { tiles };
    });
  };

  const handleSignal = async (fromUserId, data) => {
    const fresh = !peers.has(fromUserId);
    if (!get().tiles[fromUserId]) patchTile(fromUserId, { connected: false });
    const rec = createPeer(fromUserId, false);
    const { pc } = rec;
    try {
      if (data.description) {
        const desc = data.description;
        const collision = desc.type === "offer" && (rec.makingOffer || pc.signalingState !== "stable");
        rec.ignoreOffer = !rec.polite && collision;
        if (rec.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        for (const c of rec.candidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (desc.type === "offer") {
          attachLocalTracks(rec); // reuses the transceivers the offer created
          await pc.setLocalDescription();
          sendSignal(fromUserId, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        }
      } else if (data.candidate) {
        if (!pc.remoteDescription) rec.candidates.push(data.candidate);
        else await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch (err) {
      console.log("group call signal error:", err?.message);
      if (fresh && pc.connectionState === "new") removePeer(fromUserId);
    }
  };

  const clearTimers = () => {
    clearTimeout(ringTimer);
    clearTimeout(aloneTimer);
    ringTimer = null;
    aloneTimer = null;
  };

  const cleanup = () => {
    clearTimers();
    peers.forEach((rec) => {
      try {
        rec.pc.close();
      } catch {
        /* ignore */
      }
    });
    peers.clear();
    [localStream && localStream.getTracks(), cameraTrack && [cameraTrack], screenTrack && [screenTrack]]
      .filter(Boolean)
      .flat()
      .forEach((t) => t.stop());
    localStream = null;
    cameraTrack = null;
    screenTrack = null;
    camOn = false;
    hadOthers = false;
    setGroupCallBusy(false);
    set({ ...initial });
  };

  const dismissIncoming = () => {
    clearTimeout(ringTimer);
    ringTimer = null;
    stopRingtoneSound();
    if (get().incoming) set({ incoming: null });
  };

  // Everyone else is gone: end quietly (after a beat, so the UI doesn't flash).
  const checkAlone = () => {
    clearTimeout(aloneTimer);
    if (get().status !== "active") return;
    const others = Object.keys(get().tiles).length;
    if (others > 0) {
      hadOthers = true;
      return;
    }
    if (hadOthers) {
      aloneTimer = setTimeout(() => {
        if (get().status === "active" && Object.keys(get().tiles).length === 0) {
          toast("Everyone left the call", { icon: "📴" });
          get().leave();
        }
      }, 1500);
    } else {
      aloneTimer = setTimeout(() => {
        if (get().status === "active" && Object.keys(get().tiles).length === 0) {
          toast("No one joined the call", { icon: "📴" });
          get().leave();
        }
      }, NO_ONE_JOINED_MS);
    }
  };

  // Shared by "start" and "join".
  const enter = async (meta, event, payload) => {
    const socket = socketOf();
    if (!socket) return;
    if (get().status !== "idle" || useCallStore.getState().callStatus !== "idle") {
      toast.error("Already in a call");
      return;
    }
    dismissIncoming();
    setGroupCallBusy(true);
    set({ ...initial, status: "joining", groupId: meta.groupId, groupName: meta.groupName, groupPic: meta.groupPic || "", callType: meta.callType });
    primeAudio();

    try {
      const stream = await getMedia(meta.callType);
      if (get().status !== "joining") {
        // pressed Leave while the permission prompt was open
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStream = stream;
    } catch (err) {
      toast.error(err?.name === "NotAllowedError" ? "Allow microphone access to join calls" : err?.message || "Couldn't access the microphone");
      cleanup();
      return;
    }
    cameraTrack = localStream.getVideoTracks()[0] || null;
    camOn = !!cameraTrack;
    iceCfg = await getIceConfig();

    const res = await emitAck(socket, event, payload);
    if (get().status !== "joining") {
      // pressed Leave while connecting
      if (res?.ok) socket.emit("groupCall:leave", { groupId: meta.groupId });
      cleanup();
      return;
    }
    if (!res?.ok) {
      toast.error(res?.error || "Couldn't join the call");
      cleanup();
      return;
    }

    const tiles = {};
    res.participants.forEach((p) => {
      tiles[p._id] = { profile: p, connected: false };
    });
    set({
      status: "active",
      callType: res.callType || meta.callType,
      startedAt: res.startedAt || Date.now(),
      tiles,
      isMuted: false,
    });
    updateLocalVideo();
    // The newcomer makes the first move: one offer to each person already in.
    res.participants.forEach((p) => createPeer(p._id, true));
    sendMedia();
    checkAlone();
  };

  return {
    ...initial,
    incoming: null, // { groupId, groupName, groupPic, callType, from } while it rings
    states: {}, // groupId -> { active, callType, participants[] } — drives the "Join" bar

    startCall: (group, callType) =>
      enter(
        { groupId: group._id, groupName: group.name, groupPic: group.groupPic, callType },
        "groupCall:start",
        { groupId: group._id, callType }
      ),

    joinCall: (groupId, meta = {}) => {
      const st = get().states[groupId];
      const inc = get().incoming?.groupId === groupId ? get().incoming : null;
      return enter(
        {
          groupId,
          groupName: meta.name || inc?.groupName || "Group call",
          groupPic: meta.groupPic || inc?.groupPic || "",
          callType: st?.callType || inc?.callType || "audio",
        },
        "groupCall:join",
        { groupId }
      );
    },

    acceptIncoming: () => {
      const inc = get().incoming;
      if (inc) get().joinCall(inc.groupId, { name: inc.groupName, groupPic: inc.groupPic });
    },

    declineIncoming: () => {
      const inc = get().incoming;
      if (!inc) return;
      socketOf()?.emit("groupCall:decline", { groupId: inc.groupId });
      dismissIncoming();
    },

    // Ring other group members to join this call. Resolves to the ids actually rung.
    ringMembers: (userIds) =>
      new Promise((resolve) => {
        const { status, groupId } = get();
        const socket = socketOf();
        if (status !== "active" || !socket) return resolve([]);
        socket.emit("groupCall:ring", { groupId, userIds }, (res) => resolve(res?.ok ? res.rung || [] : []));
      }),

    leave: () => {
      const { status, groupId } = get();
      if (status === "idle") return;
      if (status === "active") socketOf()?.emit("groupCall:leave", { groupId });
      cleanup();
    },

    toggleMute: () => {
      const track = localStream?.getAudioTracks()[0];
      if (!track) return;
      const muted = !get().isMuted;
      track.enabled = !muted;
      set({ isMuted: muted });
      sendMedia();
    },

    toggleCamera: async () => {
      if (get().status !== "active") return;
      if (camOn) {
        camOn = false;
        cameraTrack?.stop();
        cameraTrack = null;
      } else {
        try {
          const s = await gum({
            video: { facingMode: { ideal: get().cameraFacing }, width: { ideal: 640 }, height: { ideal: 480 } },
          });
          cameraTrack = s.getVideoTracks()[0];
          camOn = true;
        } catch {
          toast.error("Couldn't access the camera");
          return;
        }
      }
      applyOutboundVideo();
    },

    // Front <-> back camera (phones). Swaps the track on every connection in place.
    flipCamera: async () => {
      if (get().status !== "active" || !camOn || screenTrack) return;
      const facing = get().cameraFacing === "user" ? "environment" : "user";
      try {
        const s = await gum({ video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } } });
        cameraTrack?.stop();
        cameraTrack = s.getVideoTracks()[0];
        set({ cameraFacing: facing });
        applyOutboundVideo();
      } catch {
        toast.error("Couldn't switch camera");
      }
    },

    toggleScreenShare: async () => {
      if (get().status !== "active") return;
      if (screenTrack) {
        get().stopScreenShare();
        return;
      }
      if (!canShareScreen()) {
        toast(noScreenShareMessage(), { icon: "🖥️", duration: 7000 });
        return;
      }
      try {
        screenTrack = await getScreenTrack();
        screenTrack.onended = () => get().stopScreenShare();
        applyOutboundVideo();
      } catch (err) {
        if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") toast.error("Couldn't start screen sharing");
      }
    },

    stopScreenShare: () => {
      if (!screenTrack) return;
      screenTrack.onended = null;
      screenTrack.stop();
      screenTrack = null;
      applyOutboundVideo();
    },

    subscribeToSocket: () => {
      const socket = socketOf();
      if (!socket) return;
      get().unsubscribeFromSocket();

      socket.on("groupCall:incoming", (inc) => {
        if (get().status !== "idle" || useCallStore.getState().callStatus !== "idle") return; // busy
        if (get().incoming?.groupId === inc.groupId) return;
        set({ incoming: inc });
        primeAudio();
        if (!shouldLeaveToSystemAlert()) startRingtone();
        clearTimeout(ringTimer);
        ringTimer = setTimeout(dismissIncoming, RING_MS);
      });

      socket.on("groupCall:dismiss", ({ groupId }) => {
        if (get().incoming?.groupId === groupId) dismissIncoming();
      });

      const applyState = (st) =>
        set((s) => {
          const states = { ...s.states };
          if (st.active) states[st.groupId] = st;
          else delete states[st.groupId];
          return { states };
        });

      socket.on("groupCall:state", (st) => {
        applyState(st);
        if (!st.active && get().incoming?.groupId === st.groupId) dismissIncoming();
        // Someone else joined the call I'm ringing for: keep ringing; I'm not in it yet.
      });
      socket.on("groupCall:states", (list) => list.forEach(applyState));

      socket.on("groupCall:joined", ({ groupId, user }) => {
        if (get().status !== "active" || get().groupId !== groupId) return;
        patchTile(user._id, { profile: user, connected: get().tiles[user._id]?.connected || false });
        hadOthers = true;
        clearTimeout(aloneTimer);
        sendMedia(); // so the newcomer sees my mic / camera state
      });

      socket.on("groupCall:left", ({ groupId, userId }) => {
        if (get().status !== "active" || get().groupId !== groupId) return;
        removePeer(userId);
        checkAlone();
      });

      socket.on("groupCall:signal", ({ groupId, fromUserId, data }) => {
        if (get().status !== "active" || get().groupId !== groupId || !data) return;
        handleSignal(fromUserId, data);
      });

      socket.on("groupCall:media", ({ groupId, userId, state }) => {
        if (get().status !== "active" || get().groupId !== groupId) return;
        patchTile(userId, { muted: !!state.muted, videoOff: !!state.videoOff, screen: !!state.screen });
      });

      // Leaving by closing the tab: tell the others right away.
      window.addEventListener("pagehide", get().leave);
    },

    unsubscribeFromSocket: () => {
      const socket = socketOf();
      [
        "groupCall:incoming",
        "groupCall:dismiss",
        "groupCall:state",
        "groupCall:states",
        "groupCall:joined",
        "groupCall:left",
        "groupCall:signal",
        "groupCall:media",
      ].forEach((e) => socket?.off(e));
      window.removeEventListener("pagehide", get().leave);
      if (get().status !== "idle") cleanup();
      dismissIncoming();
      set({ states: {} });
    },
  };
});
