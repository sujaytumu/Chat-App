import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  UploadCloud,
  MoreHorizontal,
  UserPlus,
  Minimize2,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";

const AVATAR_COLORS = ["#00695C", "#4527A0", "#AD1457", "#2E7D32", "#1565C0", "#EF6C00"];
const colorForName = (name = "") => {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

// Big avatar with a colored-letter fallback (matches WhatsApp's style when
// a contact has no photo) instead of a generic silhouette.
const CallAvatar = ({ user, size = "size-28" }) => {
  if (user?.profilePic) {
    return <img src={user.profilePic} alt={user.fullName} className={`${size} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white text-4xl font-medium`}
      style={{ backgroundColor: colorForName(user?.fullName) }}
    >
      {user?.fullName?.[0]?.toUpperCase() || "?"}
    </div>
  );
};

const gridBtn = "size-16 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 text-white transition-colors";

const CallManager = () => {
  const {
    callStatus,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isRemoteRinging,
    isScreenSharing,
    isSpeakerOn,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleSpeakerOutput,
    upgradeToVideo,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (callType === "video" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (callType === "audio" && remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callType]);

  useEffect(() => {
    if (callStatus === "idle") setIsMinimized(false);
  }, [callStatus]);

  if (callStatus === "idle") return null;

  // ---- Incoming call ----
  if (callStatus === "incoming") {
    return (
      <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
        <div className="bg-[#1F2C34] rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="relative mx-auto mb-4 size-24">
            <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
            <div className="relative">
              <CallAvatar user={remoteUser} size="size-24" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-white">{remoteUser?.fullName}</h3>
          <p className="text-sm text-[#8696A0] mb-6">
            Incoming {callType === "video" ? "video" : "voice"} call…
          </p>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={rejectCall}
                className="size-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white"
              >
                <PhoneOff size={26} />
              </button>
              <span className="text-xs text-[#8696A0]">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={acceptCall}
                className="size-16 rounded-full flex items-center justify-center bg-[#00A884] hover:bg-[#02906f] text-white animate-pulse"
              >
                <Phone size={26} />
              </button>
              <span className="text-xs text-[#8696A0]">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Minimized pill (tap to expand) ----
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#1F2C34] rounded-full pl-2 pr-4 py-2 flex items-center gap-2 shadow-2xl"
      >
        <CallAvatar user={remoteUser} size="size-8" />
        <span className="text-white text-sm font-medium">{remoteUser?.fullName}</span>
        <span className="text-[#00A884] text-xs">
          {callStatus === "calling" ? (isRemoteRinging ? "Ringing…" : "Calling…") : "In call"}
        </span>
      </button>
    );
  }

  // ---- Outgoing / active call ----
  const isVideo = callType === "video";
  const statusText =
    callStatus === "calling" ? (isRemoteRinging ? "Ringing…" : "Calling…") : isVideo ? "Video call" : "Voice call";

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B141A] flex flex-col">
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />

      {/* Top bar: minimize / name + encrypted / add participant */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 relative z-10">
        <button
          onClick={() => setIsMinimized(true)}
          className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
        >
          <Minimize2 size={18} />
        </button>
        <div className="text-center">
          <h3 className="text-white font-medium">{remoteUser?.fullName}</h3>
          <p className="text-xs text-white/60 flex items-center justify-center gap-1">
            <Lock size={10} /> End-to-end encrypted
          </p>
        </div>
        <button
          onClick={() => toast("Group calling isn't supported yet", { icon: "👥" })}
          className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
        >
          <UserPlus size={18} />
        </button>
      </div>

      {isVideo ? (
        <div className="relative flex-1 bg-black">
          <video id="call-remote-video" ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="relative mb-4">
                {callStatus === "calling" && (
                  <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
                )}
                <CallAvatar user={remoteUser} />
              </div>
              <p className="text-lg font-medium">{remoteUser?.fullName}</p>
              <p className="text-sm text-[#8696A0] mt-1">{statusText}</p>
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 right-4 w-24 h-32 sm:w-32 sm:h-44 object-cover rounded-lg border-2 border-white/20 shadow-lg"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white">
          <div className="relative mb-4">
            {callStatus === "calling" && (
              <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
            )}
            <CallAvatar user={remoteUser} />
          </div>
          <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
          <p className="text-sm text-white/70 mt-1">{statusText}</p>
        </div>
      )}

      {/* Bottom control panel — 2x3 grid matching WhatsApp:
          Speaker / Video / Mute
          More    / Share / End */}
      <div className="relative bg-black/50 rounded-t-3xl px-6 pt-6 pb-8">
        <div className="grid grid-cols-3 gap-x-6 gap-y-5 max-w-xs mx-auto">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleSpeakerOutput} className={`${gridBtn} ${isSpeakerOn ? "bg-white text-black hover:bg-white/90" : ""}`}>
              <Volume2 size={24} />
            </button>
            <span className="text-xs text-white/70">Speaker</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={isVideo ? toggleVideo : upgradeToVideo}
              className={`${gridBtn} ${isVideo && isVideoOff ? "bg-white text-black hover:bg-white/90" : ""}`}
            >
              {isVideo && isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
            </button>
            <span className="text-xs text-white/70">Video</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleMute} className={`${gridBtn} ${isMuted ? "bg-white text-black hover:bg-white/90" : ""}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <span className="text-xs text-white/70">Mute</span>
          </div>

          <div className="flex flex-col items-center gap-1.5 relative">
            <button onClick={() => setShowMoreMenu((s) => !s)} className={gridBtn}>
              <MoreHorizontal size={24} />
            </button>
            <span className="text-xs text-white/70">More</span>
            {showMoreMenu && (
              <div className="absolute bottom-full mb-2 bg-[#233138] rounded-xl shadow-2xl py-1.5 w-44 z-10">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setIsMinimized(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#D1D7DB] hover:bg-white/5"
                >
                  Switch to chat
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={isVideo ? toggleScreenShare : () => toast("Screen share needs a video call", { icon: "🖥️" })}
              className={`${gridBtn} ${isScreenSharing ? "bg-white text-black hover:bg-white/90" : ""}`}
            >
              <UploadCloud size={24} />
            </button>
            <span className="text-xs text-white/70">Share</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={endCall}
              className="size-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white"
            >
              <PhoneOff size={24} />
            </button>
            <span className="text-xs text-white/70">End</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallManager;
