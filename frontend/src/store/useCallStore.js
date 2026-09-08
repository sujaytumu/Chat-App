import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { playRingtone, primeAudio } from "../lib/notificationSound";

const ICE_SERVERS = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

let pc = null;
let ringtoneInterval = null;
let pendingCandidates = [];
let cameraTrack = null; // kept so screen share can revert back to it

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
  isSpeakerOn: true,
  isScreenSharing: false,
  audioOutputDevices: [],
  callSubscribed: false,

  startCall: async (user, callType) => {
    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!socket) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      set({ localStream: stream, callType, remoteUser: user, callStatus: "calling" });

      pc = new RTCPeerConnection(ICE_SERVERS);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: event.streams[0] });
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", { toUserId: user._id, candidate: event.candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("callUser", {
        toUserId: user._id,
        offer,
        callType,
        fromUser: { _id: authUser._id, fullName: authUser.fullName, profilePic: authUser.profilePic },
      });
    } catch {
      toast.error("Could not access camera/microphone");
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
      set({ localStream: stream, callStatus: "in-call" });

      pc = new RTCPeerConnection(ICE_SERVERS);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteStream: event.streams[0] });
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", { toUserId: remoteUser._id, candidate: event.candidate });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)));
      pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answerCall", { toUserId: remoteUser._id, answer });
    } catch {
      toast.error("Could not access camera/microphone");
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
  },

  toggleVideo: () => {
    const { localStream, isVideoOff } = get();
    localStream?.getVideoTracks().forEach((track) => (track.enabled = isVideoOff));
    set({ isVideoOff: !isVideoOff });
  },

  stopRingtone: () => {
    if (ringtoneInterval) {
      clearInterval(ringtoneInterval);
      ringtoneInterval = null;
    }
  },

  resetCall: () => {
    get().stopRingtone();
    if (pc) {
      pc.close();
      pc = null;
    }
    pendingCandidates = [];
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

  toggleScreenShare: async () => {
    const { isScreenSharing, localStream, callType } = get();
    if (callType !== "video" || !pc) return;

    const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (!videoSender) return;

    if (!isScreenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        cameraTrack = localStream?.getVideoTracks()[0] || cameraTrack;
        await videoSender.replaceTrack(screenTrack);

        // Stop sharing if the user uses the browser's own "Stop sharing" UI
        screenTrack.onended = () => get().toggleScreenShare();

        const newStream = new MediaStream([
          ...(localStream?.getAudioTracks() || []),
          screenTrack,
        ]);
        set({ localStream: newStream, isScreenSharing: true });
      } catch {
        // user cancelled the picker — no-op
      }
    } else {
      try {
        if (cameraTrack) {
          await videoSender.replaceTrack(cameraTrack);
          const newStream = new MediaStream([
            ...(localStream?.getAudioTracks() || []),
            cameraTrack,
          ]);
          set({ localStream: newStream, isScreenSharing: false });
        }
      } catch {
        set({ isScreenSharing: false });
      }
    }
  },

  subscribeToCallSocket: () => {
    if (get().callSubscribed) return;
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    set({ callSubscribed: true });

    socket.on("incomingCall", ({ fromUser, offer, callType }) => {
      // Busy? auto-reject
      if (get().callStatus !== "idle") {
        socket.emit("rejectCall", { toUserId: fromUser._id });
        return;
      }
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
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)));
      pendingCandidates = [];
      set({ callStatus: "in-call", isRemoteRinging: false });
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
      "iceCandidate",
      "callRejected",
      "callEnded",
      "callFailed",
      "callRinging",
    ].forEach((event) => socket.off(event));
    set({ callSubscribed: false });
  },
}));
