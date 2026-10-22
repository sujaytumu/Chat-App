import { tuneAudioSenders } from "../lib/audioTune";
import { canCaptureScreen, getScreenTrack, noScreenShareMessage } from "../lib/screenCapture";
import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { axiosInstance } from "../lib/axios";
import { startRingtone, stopRingtoneSound, startRingback, startCallingTone, startBusyTone, primeAudio, shouldLeaveToSystemAlert, isRingtoneActive } from "../lib/notificationSound";
import { isGroupCallBusy } from "../lib/callBusy";

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
export async function getIceConfig() {
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
  // "Connected but silent" guard: signalling can be fine while no audio packets
  // actually arrive (a dead relay path, a stuck NAT binding). Every 3 s compare
  // the bytes received; if nothing arrives for ~9 s, kick ICE (one fresh path
  // search) and keep watching. This is what turns a silent call into a working one.
  let lastBytes = -1;
  let stalls = 0;
  let kicked = false;
  const statsTimer = setInterval(async () => {
    if (peerConnection.signalingState === "closed" || peerConnection.connectionState === "closed") {
      clearInterval(statsTimer);
      return;
    }
    if (peerConnection.iceConnectionState !== "connected" && peerConnection.iceConnectionState !== "completed") return;
    try {
      const stats = await peerConnection.getStats();
      let bytes = 0;
      let sentBytes = 0;
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && !r.isRemote) bytes += r.bytesReceived || 0;
        else if (r.type === "outbound-rtp" && !r.isRemote) sentBytes += r.bytesSent || 0;
      });
      if (bytes + sentBytes > callUsageBytes) callUsageBytes = bytes + sentBytes;
      if (bytes > lastBytes) {
        stalls = 0;
        if (kicked) {
          kicked = false;
          setReconnecting(false);
        }
      } else if (lastBytes >= 0) {
        stalls += 1;
        if (stalls >= 3 && !kicked && peerConnection.restartIce) {
          kicked = true;
          stalls = 0;
          setReconnecting(true);
          peerConnection.restartIce();
        } else if (stalls >= 5 && kicked) {
          setReconnecting(true); // still nothing: the UI keeps showing "Reconnecting…"
        }
      }
      lastBytes = bytes;
    } catch {
      /* stats unavailable — ignore */
    }
  }, 3000);

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    if (state === "connected" || state === "completed") tuneAudioSenders(peerConnection);
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
// Phone clocks can differ by seconds. Both phones show the call timer from ONE start time chosen by
// the server, converted to the local clock with a measured offset (server time minus local time).
let clockOffset = 0;
function syncClock(socket) {
  if (!socket) return;
  const samples = [];
  const one = () =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setTimeout(resolve, 2500);
      socket.emit("timeSync", (serverNow) => {
        clearTimeout(timer);
        const t1 = Date.now();
        if (typeof serverNow === "number") samples.push({ rtt: t1 - t0, offset: serverNow - (t0 + t1) / 2 });
        resolve();
      });
    });
  (async () => {
    for (let i = 0; i < 3; i++) await one();
    if (samples.length) clockOffset = samples.sort((a, b) => a.rtt - b.rtt)[0].offset; // the quickest round trip is the most accurate
  })();
}
const serverToLocal = (t) => (typeof t === "number" ? t - clockOffset : Date.now());

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

// Every call has a server-issued id. A call that has ended / been declined / answered elsewhere is
// remembered for a few minutes, so a late or re-delivered "incomingCall" for it (e.g. the server handing
// a held call over again after a reconnect) never rings a second time, and a late "call ended" or
// "declined" signal about an OLD call can never hang up a newer one.
let currentCallId = null;
const endedCallIds = new Map(); // callId -> time it ended
const ENDED_CALL_TTL_MS = 5 * 60_000;
const rememberEnded = (id) => {
  if (!id) return;
  const now = Date.now();
  endedCallIds.set(id, now);
  for (const [k, t] of endedCallIds) if (now - t > ENDED_CALL_TTL_MS) endedCallIds.delete(k);
};
const wasEnded = (id) => !!id && endedCallIds.has(id);
// A signal that names a different call than the one on screen is about an old call: ignore it.
const isOtherCall = (id) => !!id && !!currentCallId && id !== currentCallId;

let pc = null;
let callUsageBytes = 0; // approx. bytes sent + received in the current call (sampled every few seconds)
let pendingCandidates = [];
let voiceOriginShare = false; // screen share started from a voice call (no camera to go back to)
let cameraTrack = null; // kept so screen share can revert back to it
let initialNegotiationDone = false; // guards against onnegotiationneeded firing during initial setup
let speakerNoticeShown = false; // the "phone decides the speaker" hint is shown once per page load
let ringing = false; // our own ringtone is (meant to be) playing for an incoming call
let ringKicked = false; // already re-started once by a tap on the incoming screen
let ringDeferred = false; // incoming ring held back while a phone's system notification is alerting
let callListenersAdded = false; // page listeners are added once, never stacked on re-subscribe
let kickListenersAdded = false;
let callClaimedAt = 0; // when the current non-idle callStatus was claimed, for stale-state detection

// Tells the other side our current mic/camera state so it can show a
// "muted" indicator. Safe to call any time; no-ops outside a call.
// A track that arrives through an already-negotiated video slot (e.g. the
// peer starts a screen share after an earlier one) can come with NO stream
// attached — event.streams is empty. Using streams[0] blindly then wiped the
// remote stream (no audio, no video). Fall back to adding it to the current one.
function remoteStreamFor(event, get) {
  if (event.streams[0]) return event.streams[0];
  const stream = get().remoteStream || new MediaStream();
  if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
  return stream;
}

// Opus tuned for phone networks: forward-error-correction on (survives packet
// loss without crackle), mono voice at a steady 32 kbps.
function tuneOpus(desc) {
  if (!desc?.sdp) return desc;
  const m = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!m) return desc;
  const pt = m[1];
  const re = new RegExp(`(a=fmtp:${pt} )([^\\r\\n]*)`);
  let sdp = desc.sdp;
  if (re.test(sdp)) {
    sdp = sdp.replace(re, (_, head, params) => {
      const set = new Map(params.split(";").filter(Boolean).map((kv) => kv.split("=")));
      set.set("useinbandfec", "1");
      set.set("maxaveragebitrate", "32000");
      set.set("stereo", "0");
      return head + [...set].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(";");
    });
  }
  return { type: desc.type, sdp };
}

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

const sendMediaState = (get) => {
  const socket = useAuthStore.getState().socket;
  const { remoteUser, isMuted, isVideoOff, isScreenSharing, callStatus } = get();
  if (!socket || !remoteUser || callStatus === "idle") return;
  socket.emit("callMediaState", {
    toUserId: remoteUser._id,
    state: { isMuted, isVideoOff, isScreenSharing, hasCamera: !voiceOriginShare },
  });
};

const stopLocalTracks = (stream) => {
  stream?.getTracks().forEach((track) => track.stop());
};

let handoffUntil = 0;
// A 1:1 call being turned into a group call: the "call ended" that follows is not a real hang-up.
export const markCallHandoff = () => {
  handoffUntil = Date.now() + 6000;
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
  audioRoutes: [], // Android app: [{ id, kind: "earpiece"|"speaker"|"bluetooth"|"wired", name }]
  audioRoute: null, // id of the output the call audio is on right now
  audioPickerOpen: false,
  isAnswering: false, // Answer was tapped (on the notification or here) and the call is connecting
  isScreenSharing: false,
  cameraFacing: "user", // front / back camera on phones
  remoteMuted: false, // the other person has muted their mic
  remoteVideoOff: false, // the other person has turned their camera off
  remoteScreenSharing: false, // the other person is sharing their screen
  isReconnecting: false, // media path dropped; ICE is trying to recover it
  autoAnswer: null, // { from, until } — "Answer" tapped on a notification before the call reached this device
  callStartedAt: null, // epoch ms when the call actually connected (drives the on-screen timer)
  audioOutputDevices: [],
  callSubscribed: false,
  callCooldownUntil: 0,

  startCall: async (user, callType) => {
    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!socket) return;
    if (get().callStatus !== "idle" || isGroupCallBusy()) {
      toast.error("Already in a call");
      return;
    }
    syncClock(socket);
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
        audio: AUDIO_CONSTRAINTS,
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

      // "Ringing…" is only shown once their device confirms it is ringing (callRingingAck).
      // Being "online" is not proof: a phone with a stale connection looks online but never rings.
      // Until then the caller hears the single "calling" tap.
      primeAudio();
      startCallingTone();

      pc = new RTCPeerConnection({ ...(await getIceConfig()), iceCandidatePoolSize: 4, bundlePolicy: "max-bundle" });
      attachConnectionWatchdog(pc, get);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: remoteStreamFor(event, get) });
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

      const offer = tuneOpus(await pc.createOffer());
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

      if (result?.callId) {
        if (isStale()) {
          // hung up while the ack was in flight: make sure the server drops this call too
          socket.emit("endCall", { toUserId: user._id, callId: result.callId });
          rememberEnded(result.callId);
        } else {
          currentCallId = result.callId;
        }
      }
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
    syncClock(socket);
    if (get().isAnswering) return; // already connecting: a second tap must not start a second answer
    set({ isAnswering: true });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: callType === "video",
      });
      set({ localStream: stream, callStatus: "in-call", callStartedAt: Date.now(), isAnswering: false });

      pc = new RTCPeerConnection({ ...(await getIceConfig()), iceCandidatePoolSize: 4, bundlePolicy: "max-bundle" });
      attachConnectionWatchdog(pc, get);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: remoteStreamFor(event, get) });
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

      const answer = tuneOpus(await pc.createAnswer());
      await pc.setLocalDescription(answer);
      initialNegotiationDone = true;

      const result = await emitWithRetry(socket, "answerCall", { toUserId: remoteUser._id, answer, callId: currentCallId || undefined }, {
        timeoutMs: 7000,
        retries: 2,
      });
      if (result.startedAt) set({ callStartedAt: serverToLocal(result.startedAt) }); // same start as the caller
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
      set({ isAnswering: false });
      toast.error("Couldn't answer the call — check mic/camera permission");
      get().endCall();
    }
  },

  rejectCall: () => {
    const socket = useAuthStore.getState().socket;
    const { remoteUser } = get();
    get().stopRingtone();
    if (socket && remoteUser) {
      socket.emit("rejectCall", { toUserId: remoteUser._id, callId: currentCallId || undefined });
    }
    get().resetCall();
  },

  endCall: () => {
    const socket = useAuthStore.getState().socket;
    const { remoteUser, callStatus } = get();
    if (socket && remoteUser && callStatus !== "idle") {
      socket.emit("endCall", { toUserId: remoteUser._id, callId: currentCallId || undefined });
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

  // Front <-> back camera (phones): swap the outgoing track without renegotiating.
  flipCamera: async () => {
    const { localStream, isScreenSharing, isVideoOff } = get();
    if (!pc || isScreenSharing || !localStream) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    const old = localStream.getVideoTracks()[0];
    if (!sender || !old) return;
    const facing = get().cameraFacing === "user" ? "environment" : "user";
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } } });
      const next = s.getVideoTracks()[0];
      next.enabled = !isVideoOff;
      await sender.replaceTrack(next);
      localStream.removeTrack(old);
      old.stop();
      localStream.addTrack(next);
      cameraTrack = next;
      set({ cameraFacing: facing, localStream: new MediaStream(localStream.getTracks()) });
    } catch {
      toast.error("Couldn't switch camera");
    }
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
    ringDeferred = false;
    ringing = false;
    ringKicked = false;
    stopRingtoneSound();
  },

  resetCall: () => {
    // Tell the server roughly how much data this call used (best-effort, never blocks the hang-up).
    try {
      const st = get();
      const sock = useAuthStore.getState().socket;
      if (sock && st.callStartedAt && st.remoteUser && callUsageBytes > 0) {
        sock.emit("callUsage", { peerId: st.remoteUser._id, bytes: Math.round(callUsageBytes) });
      }
    } catch {
      /* ignore */
    }
    callUsageBytes = 0;
    rememberEnded(currentCallId);
    currentCallId = null;
    get().stopRingtone();
    voiceOriginShare = false;
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
      cameraFacing: "user",
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
      audioRoutes: [],
      audioRoute: null,
      audioPickerOpen: false,
      isAnswering: false,
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

  // ---- Android app: choose where the call is heard (phone / speaker / Bluetooth / headphones) ----
  setAudioRoutes: (data) => {
    if (!data?.routes) return;
    set({ audioRoutes: data.routes, audioRoute: data.current, isSpeakerOn: data.current === "speaker" });
  },

  refreshAudioRoutes: async () => {
    const native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesCall : null;
    if (typeof native?.getAudioRoutes !== "function") return false;
    try {
      get().setAudioRoutes(await native.getAudioRoutes());
      return true;
    } catch {
      return false;
    }
  },

  chooseAudioRoute: async (id) => {
    const native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesCall : null;
    set({ audioPickerOpen: false });
    if (typeof native?.setAudioRoute !== "function") return;
    try {
      const res = await native.setAudioRoute({ id });
      get().setAudioRoutes(res);
      if (res?.ok === false) toast.error("Couldn't switch to that output");
    } catch {
      toast.error("Couldn't switch the audio output");
    }
  },

  closeAudioPicker: () => set({ audioPickerOpen: false }),

  // Single-tap speaker toggle (matches WhatsApp's simple on/off behavior).
  // True earpiece-vs-speaker routing is OS-managed and not something a
  // browser can control; this toggles between the default output and any
  // device whose label suggests it's a speaker, when the browser exposes
  // that (Chrome/Edge via setSinkId — Safari has no equivalent API).
  toggleSpeakerOutput: async () => {
    // Android app: switch the real loudspeaker/earpiece through the native plugin. An older app
    // build without it rejects the call, and then we fall back to the browser behaviour below.
    try {
      const native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesCall : null;
      if (native && typeof native.getAudioRoutes === "function") {
        // Ask where to play the call: Phone / Speaker / Bluetooth / Headphones.
        if (await get().refreshAudioRoutes()) set({ audioPickerOpen: true });
        return;
      }
      if (native && typeof native.setSpeaker === "function") {
        // older app build: plain on/off
        const next = !get().isSpeakerOn;
        await native.setSpeaker({ on: next });
        set({ isSpeakerOn: next });
        toast(next ? "Speaker on" : "Speaker off", { icon: "🔊", duration: 1200 });
        return;
      }
    } catch {
      /* not supported by this app version */
    }
    const remoteAudioEl = document.getElementById("call-remote-audio");
    const remoteVideoEl = document.getElementById("call-remote-video");
    const supportsSinkId = remoteAudioEl?.setSinkId || remoteVideoEl?.setSinkId;

    if (!supportsSinkId || !navigator.mediaDevices?.enumerateDevices) {
      // Phone browsers (Android Chrome, iOS Safari) don't let a web page pick the
      // earpiece or the loudspeaker — the phone decides. Still flip the button so
      // it shows its on/off state like WhatsApp, and say so once, plainly.
      set({ isSpeakerOn: !get().isSpeakerOn });
      if (!speakerNoticeShown) {
        speakerNoticeShown = true;
        const inApp = !!window.Capacitor?.isNativePlatform?.();
        toast(inApp ? "Install the latest Talkies app to switch the speaker" : "This browser can't switch the speaker — your phone decides where call audio plays", {
          icon: "🔊",
          duration: 3500,
        });
      }
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
    const { isScreenSharing, localStream } = get();
    if (!pc || get().callStatus !== "in-call") {
      toast("You can share your screen once the call connects", { icon: "🖥️" });
      return;
    }
    // Phone browsers don't implement getDisplayMedia — say so instead of
    // silently doing nothing.
    if (!isScreenSharing && !canCaptureScreen()) {
      toast.error(noScreenShareMessage(), { duration: 7000 });
      return;
    }

    // Reuse the call's existing video sender/transceiver for both starting and
    // stopping a share, so switching never adds a second video m-line (which
    // would need a full renegotiation and can leave the peer on a dead track).
    // Looked up via the transceiver so it's still found if the sender's
    // current track is null.
    const videoTransceiver = pc
      .getTransceivers()
      .find((t) => t.sender.track?.kind === "video" || t.receiver.track?.kind === "video");
    let videoSender = videoTransceiver?.sender; // undefined in a voice call: added on demand below

    const audioTracks = localStream?.getAudioTracks() || [];

    if (!isScreenSharing) {
      let screenTrack;
      try {
        screenTrack = await getScreenTrack();
      } catch {
        return; // user cancelled the picker — no-op
      }
      if (!pc || get().callStatus === "idle") {
        screenTrack.stop(); // call ended while the picker was open
        return;
      }
      try {
        cameraTrack = localStream?.getVideoTracks()[0] || cameraTrack;
        voiceOriginShare = !cameraTrack;
        if (videoSender) {
          try {
            videoSender.setStreams?.(localStream || new MediaStream());
          } catch {
            // not supported — receiver falls back to the current stream
          }
          await videoSender.replaceTrack(screenTrack);
          // A video slot we only ever *received* on (peer shared earlier) is
          // recvonly — replacing its track alone would send nothing.
          if (videoTransceiver && videoTransceiver.direction !== "sendrecv" && videoTransceiver.direction !== "sendonly") {
            videoTransceiver.direction = "sendrecv"; // renegotiates
          }
        } else {
          // Sharing from a voice call: add a video track (renegotiates)
          videoSender = pc.addTrack(screenTrack, localStream || new MediaStream());
        }

        // Stop sharing if the user uses the browser's own "Stop sharing" UI
        screenTrack.onended = () => {
          if (get().isScreenSharing) get().toggleScreenShare();
        };

        set({
          localStream: new MediaStream([...audioTracks, screenTrack]),
          isScreenSharing: true,
          callType: "video",
        });
        sendMediaState(get);
      } catch {
        screenTrack.stop();
        toast.error("Couldn't start screen sharing");
      }
    } else {
      const screenTrack = localStream?.getVideoTracks()[0];
      if (voiceOriginShare && videoSender) {
        // Started from a voice call: no camera to restore — just stop sending
        // video and drop back to the voice layout.
        try {
          await videoSender.replaceTrack(null);
        } catch {
          // ignore — track already gone
        }
        if (screenTrack) {
          screenTrack.onended = null;
          screenTrack.stop();
        }
        set({ localStream: new MediaStream(audioTracks), isScreenSharing: false, callType: "audio" });
        sendMediaState(get); // hasCamera:false tells the peer to drop back too
        voiceOriginShare = false;
        return;
      }
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
    syncClock(socket);
    getIceConfig(); // warm the cache so answering/placing a call isn't delayed

    // Coming back to the app (tapping the call notification, unlocking, switching back) while a call is
    // still ringing: play the same ringtone right away, whether it was held back or got blocked.
    // Wi-Fi <-> mobile data switch or signal back mid-call: reconnect the call's media path at once.
    window.addEventListener("online", () => {
      try {
        if (pc && get().callStatus === "in-call" && pc.restartIce) pc.restartIce();
      } catch { /* ignore */ }
    });
    const resumeRing = () => {
      if (document.visibilityState !== "visible" || get().callStatus !== "incoming" || get().isAnswering) return;
      primeAudio();
      // Also restart when we believe it is ringing but the phone paused the sound while the app was
      // away (leaving the app / switching tabs and coming back used to leave the call silent or wrong).
      if (ringDeferred || !ringing || !isRingtoneActive()) {
        ringDeferred = false;
        ringing = true;
        startRingtone({ keepIfPlaying: true });
      }
    };
    if (!callListenersAdded) {
      callListenersAdded = true;
      document.addEventListener("visibilitychange", resumeRing);
      window.addEventListener("focus", resumeRing);
      window.addEventListener("pageshow", resumeRing);
    }
    // Browsers only allow sound after a touch: the first tap on the incoming-call screen unlocks audio and
    // restarts the ringtone, so it is never silent.
    const kick = () => {
      if (get().callStatus !== "incoming" || get().isAnswering || ringKicked) return;
      ringKicked = true;
      primeAudio();
      if (ringing || ringDeferred) {
        ringDeferred = false;
        ringing = true;
        startRingtone({ keepIfPlaying: true });
      }
    };
    if (!kickListenersAdded) {
      kickListenersAdded = true;
      document.addEventListener("pointerdown", kick, true);
      document.addEventListener("touchstart", kick, true);
    }

    socket.on("incomingCall", ({ fromUser, offer, callType, callId }) => {
      // This exact call already ended / was declined / answered on this device: the server handed it
      // over again (reconnect, app brought to the front) — never ring for it a second time.
      if (wasEnded(callId)) {
        socket.emit("rejectCall", { toUserId: fromUser._id, callId });
        return;
      }
      // In a group call: this is a busy signal for the caller.
      if (isGroupCallBusy()) {
        socket.emit("rejectCall", { toUserId: fromUser._id, callId, busy: true });
        return;
      }
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
        // The first ack may have gone out on a dead connection: confirm again so the caller's
        // screen moves from "Calling…" to "Ringing…" (harmless if they already got it).
        if (get().callStatus === "incoming") socket.emit("callRingingAck", { toUserId: fromUser._id, callId });
        return;
      }
      if (get().callStatus !== "idle") {
        socket.emit("rejectCall", { toUserId: fromUser._id, callId, busy: true });
        return;
      }
      callClaimedAt = Date.now();
      currentCallId = callId || null;
      set({
        callStatus: "incoming",
        remoteUser: fromUser,
        incomingOffer: offer,
        callType,
      });
      // Tell the caller our device actually got the call and is ringing —
      // lets their screen switch from "Calling…" to "Ringing…"
      socket.emit("callRingingAck", { toUserId: fromUser._id, callId });

      // They already pressed "Answer" on the notification: pick up right away
      // instead of ringing.
      const auto = get().autoAnswer;
      if (auto && String(auto.from) === String(fromUser._id) && Date.now() < auto.until) {
        set({ autoAnswer: null });
        get().acceptCall();
        return;
      }

      primeAudio();
      // Phone in the background: the system notification is already ringing —
      // hold our own ring until the app is brought to the front.
      ringKicked = false;
      if (shouldLeaveToSystemAlert()) {
        ringDeferred = true;
      } else {
        ringing = true;
        startRingtone(); // plays the tone chosen in Settings (or their own file) and vibrates
      }
    });

    socket.on("callAnswered", async ({ answer, callId, startedAt }) => {
      if (isOtherCall(callId)) return;
      if (!pc) {
        console.warn("Received callAnswered but no active peer connection — call may have already ended");
        return;
      }
      if (pc.signalingState !== "have-local-offer") return; // duplicate/late answer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        pendingCandidates = [];
        stopRingtoneSound(); // the ringing tone ends the moment they pick up
        set({ callStatus: "in-call", isRemoteRinging: false, callStartedAt: serverToLocal(startedAt) });
        sendMediaState(get);
      } catch (err) {
        console.error("Failed to apply call answer:", err);
        toast.error("Call couldn't connect");
        get().endCall();
      }
    });

    socket.on("remoteMediaState", ({ isMuted, isVideoOff, isScreenSharing, hasCamera }) => {
      if (get().callStatus === "idle") return;
      const wasSharing = get().remoteScreenSharing;
      const patch = {
        remoteMuted: !!isMuted,
        remoteVideoOff: !!isVideoOff,
        remoteScreenSharing: !!isScreenSharing,
      };
      // They stopped a screen share that began in a voice call and have no
      // camera: drop back to the voice layout (unless I'm sending my camera).
      if (wasSharing && !isScreenSharing && hasCamera === false && !get().localStream?.getVideoTracks().length) {
        patch.callType = "audio";
      }
      set(patch);
    });

    socket.on("remoteDeviceRinging", (payload) => {
      if (isOtherCall(payload?.callId)) return;
      if (get().callStatus === "calling") startRingback(); // caller hears the Talkies tune while it rings
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

    socket.on("callRejected", (payload) => {
      if (isOtherCall(payload?.callId) || get().callStatus === "idle") return;
      const busy = !!payload?.busy && get().callStatus === "calling";
      toast(busy ? "They're on another call" : "Call declined", { icon: busy ? "📞" : "📵" });
      get().resetCall();
      if (busy) startBusyTone(); // one long tone a few times, like a real busy line
    });

    socket.on("callEnded", (payload) => {
      const id = payload?.callId;
      // Remember it even if nothing is on screen: a late hand-over of this call must stay silent.
      if (id && get().callStatus === "idle") rememberEnded(id);
      if (isOtherCall(id)) return;
      if (Date.now() < handoffUntil) return;
      if (get().callStatus === "idle") return;
      toast(payload?.reason || "Call ended", { icon: "📴" });
      get().resetCall();
    });

    socket.on("callRinging", ({ reason, callId }) => {
      if (isOtherCall(callId)) return;
      toast(reason || "Calling…", { icon: "📞" });
    });

    socket.on("callFailed", ({ reason, callId }) => {
      if (isOtherCall(callId)) return;
      if (get().callStatus === "idle") return;
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
