import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { axiosInstance } from "../lib/axios";
import { playRingtone, primeAudio, stopVibration } from "../lib/notificationSound";

// STUN alone frequently fails to establish a working media path on mobile
// carrier networks (symmetric NAT / CGNAT is extremely common on VoLTE/5G),
// which is exactly the "call connects but there's zero audio" symptom — the
// signaling succeeds, but no direct peer-to-peer route for the actual media
// can be found. A TURN server relays the media through itself as a fallback
// whenever a direct route isn't possible. Using Open Relay's free public
// TURN service (openrelay.metered.ca) in addition to STUN.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// Prefer the server-configured ICE servers (private TURN credentials from the
// backend env); fall back to the built-in defaults above if that fails.
let iceConfigCache = null;
async function getIceConfig() {
  if (iceConfigCache) return iceConfigCache;
  try {
    const res = await axiosInstance.get("/calls/ice-config", { timeout: 4000 });
    if (res.data?.hasTurn) {
      iceConfigCache = { iceServers: res.data.iceServers };
      return iceConfigCache;
    }
  } catch {
    // fall through to defaults
  }
  return ICE_SERVERS;
}

// Watches the actual media connection (not just signaling) and gives clear
// feedback + cleans up if it genuinely fails or drops — instead of a call
// silently sitting there connected-in-name-only with no audio flowing.
// Tries an ICE restart first on "failed", since that's often recoverable
// (a brief network hiccup), rather than hanging up on the first blip.
function attachConnectionWatchdog(peerConnection, get) {
  let disconnectTimer = null;
  let restartAttempted = false;
  // Surfaced in the call UI as a "Reconnecting…" state while the media path is
  // down but we're still trying to recover it.
  const setReconnecting = (isReconnecting) => {
    if (useCallStore.getState().isReconnecting !== isReconnecting) {
      useCallStore.setState({ isReconnecting });
    }
  };
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    if (state === "failed") {
      if (!restartAttempted && peerConnection.restartIce) {
        restartAttempted = true;
        try {
          peerConnection.restartIce();
          setReconnecting(true);
          return; // give the restart a chance before giving up
        } catch {
          // fall through to hanging up
        }
      }
      toast.error("Call couldn't connect — network issue");
      get().endCall();
    } else if (state === "disconnected") {
      setReconnecting(true);
      clearTimeout(disconnectTimer);
      disconnectTimer = setTimeout(() => {
        if (peerConnection.iceConnectionState === "disconnected") {
          toast.error("Call connection lost");
          get().endCall();
        }
      }, 15000);
    } else if (state === "connected" || state === "completed") {
      clearTimeout(disconnectTimer);
      restartAttempted = false;
      setReconnecting(false);
    }
  };
}

// Emits a call-signaling event and waits for the server's acknowledgment
// that it was actually delivered. If the ack doesn't arrive in time (the
// message can be silently lost if the connection blips at the exact moment
// of sending), retries once automatically rather than leaving both sides
// stuck — this was very likely why calls sometimes appeared to connect on
// one side with the other never finding out.
function emitWithRetry(socket, event, payload, { timeoutMs = 4000, retries = 1 } = {}) {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryEmit = () => {
      attempt++;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (attempt <= retries) {
          tryEmit();
        } else {
          resolve({ delivered: false, reason: "timeout" });
        }
      }, timeoutMs);

      socket.emit(event, payload, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response || { delivered: true });
      });
    };
    tryEmit();
  });
}

let pc = null;
let ringtoneInterval = null;
let pendingCandidates = [];
let cameraTrack = null; // kept so screen share can revert back to it
let initialNegotiationDone = false; // guards against onnegotiationneeded firing during initial setup
let callClaimedAt = 0; // when the current non-idle callStatus was claimed, for stale-state detection

// Tells the other side our current mic/camera state so it can show a
// "muted" indicator. Safe to call any time; no-ops outside a call.
const sendMediaState = (get) => {
  const socket = useAuthStore.getState().socket;
  const { remoteUser, isMuted, isVideoOff, isScreenSharing, callStatus } = get();
  if (!socket || !remoteUser || callStatus === "idle") return;
  socket.emit("callMediaState", {
    toUserId: remoteUser._id,
    state: { isMuted, isVideoOff, isScreenSharing },
  });
};

const stopLocalTracks = (stream) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const useCallStore = create((set, get) => ({
  // "idle" | "calling" (outgoing, ringing) | "incoming" | "in-call"
  callStatus: "idle",
  callType: "audio", // "audio" | "video"
  remoteUser: null, // { _id, fullName, profilePic }
  incomingOffer: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isRemoteRinging: false, // true once the callee's device has actually started ringing
  isSpeakerOn: false, // calls start on earpiece by default, like a real phone call
  isScreenSharing: false,
  remoteMuted: false, // the other person has muted their mic
  remoteVideoOff: false, // the other person has turned their camera off
  remoteScreenSharing: false, // the other person is sharing their screen
  isReconnecting: false, // media path dropped; ICE is trying to recover it
  callStartedAt: null, // epoch ms when the call actually connected (drives the on-screen timer)
  audioOutputDevices: [],
  callSubscribed: false,
  callCooldownUntil: 0,

  startCall: async (user, callType) => {
    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!socket) return;
    if (get().callStatus !== "idle") {
      toast.error("Already in a call");
      return;
    }
    if (Date.now() < get().callCooldownUntil) {
      toast("Please wait a moment before calling again", { icon: "⏳" });
      return;
    }

    // Claim the "busy" state synchronously, before any async work (including
    // the getUserMedia permission prompt, which can take a noticeable
    // moment). Without this, there's a window where callStatus is still
    // "idle" while a call is already being placed — an incoming call
    // arriving in that window wouldn't correctly detect we're mid-dial,
    // corrupting the shared connection state.
    set({ callStatus: "calling", callType, remoteUser: user });
    const claimedAt = Date.now();
    callClaimedAt = claimedAt;
    // If the user hits End/cancel (or the call is reset) while an await below
    // is pending — e.g. the mic permission prompt — this call is no longer
    // valid and must not carry on creating a connection / ringing the callee.
    const isStale = () => get().callStatus !== "calling" || callClaimedAt !== claimedAt;

    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Calls need a secure (https) connection");
        get().resetCall();
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
    } catch {
      toast.error("Could not access camera/microphone");
      get().resetCall();
      return;
    }
    if (isStale()) {
      stopLocalTracks(stream);
      return;
    }

    try {
      set({ localStream: stream });

      // If we already know they're online, show "Ringing…" right away rather
      // than waiting on the ack round-trip — only genuinely-offline calls
      // should sit at a plain "Calling…" while the server holds it open.
      if (useAuthStore.getState().onlineUsers.includes(user._id)) {
        set({ isRemoteRinging: true });
      }

      pc = new RTCPeerConnection(await getIceConfig());
      attachConnectionWatchdog(pc, get);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: event.streams[0] });
        if (event.track.kind === "video" && get().callType !== "video") {
          set({ callType: "video" });
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", { toUserId: user._id, candidate: event.candidate });
        }
      };

      pc.onnegotiationneeded = async () => {
        if (!initialNegotiationDone) return; // skip the automatic initial firing
        try {
          const renegotiationOffer = await pc.createOffer();
          await pc.setLocalDescription(renegotiationOffer);
          socket.emit("webrtcRenegotiate", { toUserId: user._id, offer: renegotiationOffer });
        } catch {
          // ignore — best-effort renegotiation
        }
      };

      const offer = await pc.createOffer();
      if (isStale()) {
        get().resetCall();
        return;
      }
      await pc.setLocalDescription(offer);
      initialNegotiationDone = true;

      // retries: 0 — re-emitting "callUser" makes the callee receive the same
      // call several times (the second one used to be auto-rejected as
      // "busy", which then hung up the caller). The server acks instantly now.
      const result = await emitWithRetry(socket, "callUser", {
        toUserId: user._id,
        offer,
        callType,
        fromUser: { _id: authUser._id, fullName: authUser.fullName, profilePic: authUser.profilePic },
      }, { timeoutMs: 10000, retries: 0 });

      if (!result.delivered && result.reason === "timeout") {
        console.warn("callUser wasn't acknowledged — continuing to wait anyway");
      }
    } catch (err) {
      console.error("startCall failed:", err);
      toast.error("Couldn't start the call");
      get().resetCall();
    }
  },

  acceptCall: async () => {
    const socket = useAuthStore.getState().socket;
    const { incomingOffer, remoteUser, callType } = get();
    if (!socket || !incomingOffer) return;

    get().stopRingtone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      set({ localStream: stream, callStatus: "in-call", callStartedAt: Date.now() });

      pc = new RTCPeerConnection(await getIceConfig());
      attachConnectionWatchdog(pc, get);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: event.streams[0] });
        // If the other side upgraded to video mid-call, a video track
        // arrives after the call started as audio-only — switch our UI too.
        if (event.track.kind === "video" && get().callType !== "video") {
          set({ callType: "video" });
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", { toUserId: remoteUser._id, candidate: event.candidate });
        }
      };
      pc.onnegotiationneeded = async () => {
        if (!initialNegotiationDone) return;
        try {
          const renegotiationOffer = await pc.createOffer();
          await pc.setLocalDescription(renegotiationOffer);
          socket.emit("webrtcRenegotiate", { toUserId: remoteUser._id, offer: renegotiationOffer });
        } catch {
          // ignore — best-effort renegotiation
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
      pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      initialNegotiationDone = true;

      const result = await emitWithRetry(socket, "answerCall", { toUserId: remoteUser._id, answer }, {
        timeoutMs: 7000,
        retries: 2,
      });
      if (!result.delivered) {
        // Don't hang up here on a bare ack failure — if the answer genuinely
        // never reached the caller, the peer connection will never actually
        // establish (no ICE connectivity), and the connection watchdog
        // below will catch that and end the call with a clear reason. That's
        // a more accurate signal than guessing off a single ack timeout,
        // which was wrongly killing calls that were actually still fine.
        console.warn("answerCall wasn't acknowledged after retries — relying on the connection watchdog");
      }
    } catch (err) {
      console.error("acceptCall failed:", err);
      toast.error("Couldn't answer the call — check mic/camera permission");
      get().endCall();
    }
  },

  rejectCall: () => {
    const socket = useAuthStore.getState().socket;
    const { remoteUser } = get();
    get().stopRingtone();
    if (socket && remoteUser) {
      socket.emit("rejectCall", { toUserId: remoteUser._id });
    }
    get().resetCall();
  },

  endCall: () => {
    const socket = useAuthStore.getState().socket;
    const { remoteUser, callStatus } = get();
    if (socket && remoteUser && callStatus !== "idle") {
      socket.emit("endCall", { toUserId: remoteUser._id });
    }
    get().resetCall();
  },

  toggleMute: () => {
    const { localStream, isMuted } = get();
    localStream?.getAudioTracks().forEach((track) => (track.enabled = isMuted));
    set({ isMuted: !isMuted });
    sendMediaState(get);
  },

  toggleVideo: () => {
    const { localStream, isVideoOff, isScreenSharing } = get();
    if (isScreenSharing) {
      // The outgoing video track is the screen right now — toggling it would
      // blank the share instead of the camera.
      toast("Stop sharing your screen to change the camera", { icon: "🖥️" });
      return;
    }
    localStream?.getVideoTracks().forEach((track) => (track.enabled = isVideoOff));
    set({ isVideoOff: !isVideoOff });
    sendMediaState(get);
  },

  // Upgrades an in-progress voice call to video, mirroring WhatsApp's
  // "tap the video icon during a voice call" behavior.
  upgradeToVideo: async () => {
    const { callType, localStream } = get();
    if (callType === "video" || !pc) return;
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = videoStream.getVideoTracks()[0];
      cameraTrack = videoTrack;
      pc.addTrack(videoTrack, localStream); // fires onnegotiationneeded, which re-signals
      const newStream = new MediaStream([...(localStream?.getAudioTracks() || []), videoTrack]);
      set({ localStream: newStream, callType: "video" });
    } catch {
      toast.error("Could not access camera");
    }
  },

  stopRingtone: () => {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
    stopVibration();
  },

  resetCall: () => {
    get().stopRingtone();
    if (pc) {
      pc.close();
      pc = null;
    }
    pendingCandidates = [];
    initialNegotiationDone = false;
    callClaimedAt = 0;
    stopLocalTracks(get().localStream);
    if (cameraTrack) {
      cameraTrack.stop();
      cameraTrack = null;
    }
    set({
      callStatus: "idle",
      remoteUser: null,
      incomingOffer: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
      isRemoteRinging: false,
      isScreenSharing: false,
      isSpeakerOn: false,
      isReconnecting: false,
      remoteMuted: false,
      remoteVideoOff: false,
      remoteScreenSharing: false,
      callStartedAt: null,
      callCooldownUntil: Date.now() + 2000, // brief guard against accidental rapid re-tapping
    });
  },

  // Web has no real "earpiece vs speaker" switch like a native phone app —
  // that routing is OS-managed. What IS possible is picking which audio
  // OUTPUT DEVICE plays the call (works in Chrome/Edge; Safari doesn't
  // support setSinkId at all). List devices so the UI can offer a picker.
  loadAudioOutputDevices: async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      set({ audioOutputDevices: outputs });
    } catch {
      // ignore — picker just won't be available
    }
  },

  setAudioOutputDevice: async (deviceId) => {
    const remoteAudioEl = document.getElementById("call-remote-audio");
    const remoteVideoEl = document.getElementById("call-remote-video");
    for (const el of [remoteAudioEl, remoteVideoEl]) {
      if (el?.setSinkId) {
        try {
          await el.setSinkId(deviceId);
        } catch {
          toast.error("Couldn't switch audio output on this device");
          return;
        }
      }
    }
    set({ isSpeakerOn: true });
  },

  // Single-tap speaker toggle (matches WhatsApp's simple on/off behavior).
  // True earpiece-vs-speaker routing is OS-managed and not something a
  // browser can control; this toggles between the default output and any
  // device whose label suggests it's a speaker, when the browser exposes
  // that (Chrome/Edge via setSinkId — Safari has no equivalent API).
  toggleSpeakerOutput: async () => {
    const remoteAudioEl = document.getElementById("call-remote-audio");
    const remoteVideoEl = document.getElementById("call-remote-video");
    const supportsSinkId = remoteAudioEl?.setSinkId || remoteVideoEl?.setSinkId;

    if (!supportsSinkId || !navigator.mediaDevices?.enumerateDevices) {
      toast("Speaker routing is controlled by your device on this browser", { icon: "🔊" });
      return;
    }

    try {
      await get().loadAudioOutputDevices();
      const devices = get().audioOutputDevices;
      const speakerDevice = devices.find((d) => /speaker|loud/i.test(d.label));
      const earpieceDevice = devices.find((d) => /earpiece|receiver|handset/i.test(d.label));
      const nextIsSpeakerOn = !get().isSpeakerOn;
      const targetId = nextIsSpeakerOn
        ? speakerDevice?.deviceId || "default"
        : earpieceDevice?.deviceId || "default";

      for (const el of [remoteAudioEl, remoteVideoEl]) {
        if (el?.setSinkId) await el.setSinkId(targetId).catch(() => {});
      }
      set({ isSpeakerOn: nextIsSpeakerOn });
      toast(nextIsSpeakerOn ? "Speaker on" : "Speaker off", { icon: "🔊", duration: 1200 });
      if (!speakerDevice && !earpieceDevice) {
        toast("Your device doesn't expose separate speaker/earpiece outputs to the browser", {
          icon: "ℹ️",
          duration: 3000,
        });
      }
    } catch {
      toast.error("Couldn't switch audio output");
    }
  },

  toggleScreenShare: async () => {
    const { isScreenSharing, localStream, callType } = get();
    if (callType !== "video" || !pc) return;

    // Reuse the call's existing video sender/transceiver for both starting and
    // stopping a share, so switching never adds a second video m-line (which
    // would need a full renegotiation and can leave the peer on a dead track).
    // Looked up via the transceiver so it's still found if the sender's
    // current track is null.
    const videoTransceiver = pc
      .getTransceivers()
      .find((t) => t.sender.track?.kind === "video" || t.receiver.track?.kind === "video");
    const videoSender = videoTransceiver?.sender;
    if (!videoSender) return;

    const audioTracks = localStream?.getAudioTracks() || [];

    if (!isScreenSharing) {
      let screenTrack;
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenTrack = displayStream.getVideoTracks()[0];
      } catch {
        return; // user cancelled the picker — no-op
      }
      if (!pc || get().callStatus === "idle") {
        screenTrack.stop(); // call ended while the picker was open
        return;
      }
      try {
        cameraTrack = localStream?.getVideoTracks()[0] || cameraTrack;
        await videoSender.replaceTrack(screenTrack);

        // Stop sharing if the user uses the browser's own "Stop sharing" UI
        screenTrack.onended = () => {
          if (get().isScreenSharing) get().toggleScreenShare();
        };

        set({
          localStream: new MediaStream([...audioTracks, screenTrack]),
          isScreenSharing: true,
        });
        sendMediaState(get);
      } catch {
        screenTrack.stop();
        toast.error("Couldn't start screen sharing");
      }
    } else {
      const screenTrack = localStream?.getVideoTracks()[0];
      try {
        // The camera track may have ended while the screen was being shared
        // (e.g. the device revoked it) — fetch a fresh one rather than
        // sending a dead track to the peer.
        if (!cameraTrack || cameraTrack.readyState === "ended") {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          cameraTrack = camStream.getVideoTracks()[0];
        }
        cameraTrack.enabled = !get().isVideoOff;
        await videoSender.replaceTrack(cameraTrack);
        set({
          localStream: new MediaStream([...audioTracks, cameraTrack]),
          isScreenSharing: false,
        });
      } catch {
        toast.error("Couldn't switch back to your camera");
        set({ isScreenSharing: false });
      } finally {
        // Release the capture (clears the browser's "sharing" indicator) —
        // previously the screen track was left running after toggling off.
        if (screenTrack && screenTrack !== cameraTrack) {
          screenTrack.onended = null;
          screenTrack.stop();
        }
        sendMediaState(get);
      }
    }
  },

  subscribeToCallSocket: () => {
    if (get().callSubscribed) return;
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    set({ callSubscribed: true });
    getIceConfig(); // warm the cache so answering/placing a call isn't delayed

    socket.on("incomingCall", ({ fromUser, offer, callType }) => {
      // Busy? auto-reject — but first self-heal a genuinely stale state
      // (callStatus says busy but there's no active connection AND it's
      // been long enough that this can't just be the brief setup window
      // between claiming "calling"/"incoming" and the peer connection
      // actually being created) — otherwise every future incoming call
      // would be silently blocked forever after any past error.
      const STALE_THRESHOLD_MS = 25000;
      if (get().callStatus !== "idle" && !pc && Date.now() - callClaimedAt > STALE_THRESHOLD_MS) {
        get().resetCall();
      }
      // A duplicate of the call we're already ringing/in with the same person
      // (e.g. a re-delivered offer) must be ignored — rejecting it would send
      // "callRejected" to the caller and hang up the real call.
      if (get().callStatus !== "idle" && get().remoteUser?._id === fromUser._id) {
        return;
      }
      if (get().callStatus !== "idle") {
        socket.emit("rejectCall", { toUserId: fromUser._id });
        return;
      }
      callClaimedAt = Date.now();
      set({
        callStatus: "incoming",
        remoteUser: fromUser,
        incomingOffer: offer,
        callType,
      });
      playRingtone();
      primeAudio();
      ringtoneInterval = setInterval(playRingtone, 2000);
      // Tell the caller our device actually got the call and is ringing —
      // lets their screen switch from "Calling…" to "Ringing…"
      socket.emit("callRingingAck", { toUserId: fromUser._id });
    });

    socket.on("callAnswered", async ({ answer }) => {
      if (!pc) {
        console.warn("Received callAnswered but no active peer connection — call may have already ended");
        return;
      }
      if (pc.signalingState !== "have-local-offer") return; // duplicate/late answer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        pendingCandidates = [];
        set({ callStatus: "in-call", isRemoteRinging: false, callStartedAt: Date.now() });
        sendMediaState(get);
      } catch (err) {
        console.error("Failed to apply call answer:", err);
        toast.error("Call couldn't connect");
        get().endCall();
      }
    });

    socket.on("remoteMediaState", ({ isMuted, isVideoOff, isScreenSharing }) => {
      if (get().callStatus === "idle") return;
      set({
        remoteMuted: !!isMuted,
        remoteVideoOff: !!isVideoOff,
        remoteScreenSharing: !!isScreenSharing,
      });
    });

    socket.on("remoteDeviceRinging", () => {
      set({ isRemoteRinging: true });
    });

    socket.on("iceCandidate", ({ candidate }) => {
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.push(candidate);
      }
    });

    // Mid-call renegotiation (voice -> video upgrade)
    socket.on("webrtcRenegotiateOffer", async ({ offer }) => {
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const toUserId = get().remoteUser?._id;
        if (toUserId) socket.emit("webrtcRenegotiateAnswer", { toUserId, answer });
      } catch {
        // ignore — best-effort renegotiation
      }
    });

    socket.on("webrtcRenegotiateAnswer", async ({ answer }) => {
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch {
        // ignore
      }
    });

    socket.on("callRejected", () => {
      toast("Call declined", { icon: "📵" });
      get().resetCall();
    });

    socket.on("callEnded", () => {
      toast("Call ended", { icon: "📴" });
      get().resetCall();
    });

    socket.on("callRinging", ({ reason }) => {
      toast(reason || "Ringing…", { icon: "📞" });
    });

    socket.on("callFailed", ({ reason }) => {
      toast.error(reason || "Call failed");
      get().resetCall();
    });
  },

  unsubscribeFromCallSocket: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    [
      "incomingCall",
      "callAnswered",
      "remoteDeviceRinging",
      "remoteMediaState",
      "iceCandidate",
      "webrtcRenegotiateOffer",
      "webrtcRenegotiateAnswer",
      "callRejected",
      "callEnded",
      "callFailed",
      "callRinging",
    ].forEach((event) => socket.off(event));
    set({ callSubscribed: false });
  },
}));
