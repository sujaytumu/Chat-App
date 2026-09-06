import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import { playRingtone } from "../lib/notificationSound";

const ICE_SERVERS = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

let pc = null;
let ringtoneInterval = null;
let pendingCandidates = [];

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
    set({
      callStatus: "idle",
      remoteUser: null,
      incomingOffer: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
    });
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
      ringtoneInterval = setInterval(playRingtone, 2000);
    });

    socket.on("callAnswered", async ({ answer }) => {
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      pendingCandidates.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)));
      pendingCandidates = [];
      set({ callStatus: "in-call" });
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

    socket.on("callFailed", ({ reason }) => {
      toast.error(reason || "Call failed");
      get().resetCall();
    });
  },

  unsubscribeFromCallSocket: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    ["incomingCall", "callAnswered", "iceCandidate", "callRejected", "callEnded", "callFailed"].forEach(
      (event) => socket.off(event)
    );
    set({ callSubscribed: false });
  },
}));
