import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";

const CallManager = () => {
  const {
    callStatus,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

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

  if (callStatus === "idle") return null;

  // ---- Incoming call ----
  if (callStatus === "incoming") {
    return (
      <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
        <div className="bg-base-100 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
          <img
            src={remoteUser?.profilePic || "/avatar.png"}
            alt={remoteUser?.fullName}
            className="size-24 rounded-full object-cover mx-auto mb-4 ring-4 ring-primary/30"
          />
          <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
          <p className="text-sm text-zinc-500 mb-6">
            Incoming {callType === "video" ? "video" : "voice"} call…
          </p>
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={rejectCall}
              className="btn btn-circle btn-lg bg-red-500 hover:bg-red-600 border-none text-white"
            >
              <PhoneOff size={24} />
            </button>
            <button
              onClick={acceptCall}
              className="btn btn-circle btn-lg bg-green-500 hover:bg-green-600 border-none text-white animate-pulse"
            >
              <Phone size={24} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Outgoing / active call ----
  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <audio ref={remoteAudioRef} autoPlay />

      {isVideo ? (
        <div className="relative flex-1 bg-zinc-900">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <img
                src={remoteUser?.profilePic || "/avatar.png"}
                alt={remoteUser?.fullName}
                className="size-24 rounded-full object-cover mb-4"
              />
              <p className="text-lg">{callStatus === "calling" ? "Calling…" : "Connecting…"}</p>
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-24 right-4 w-28 h-40 sm:w-36 sm:h-52 object-cover rounded-lg border-2 border-white/30 shadow-lg"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white">
          <img
            src={remoteUser?.profilePic || "/avatar.png"}
            alt={remoteUser?.fullName}
            className="size-28 rounded-full object-cover mb-4 ring-4 ring-white/20"
          />
          <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
          <p className="text-sm text-white/70 mt-1">
            {callStatus === "calling" ? "Calling…" : "Voice call · connected"}
          </p>
        </div>
      )}

      <div className="p-6 flex items-center justify-center gap-6 bg-black/60">
        <button
          onClick={toggleMute}
          className={`btn btn-circle btn-lg ${isMuted ? "bg-white text-black" : "bg-white/20 text-white"} border-none`}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {isVideo && (
          <button
            onClick={toggleVideo}
            className={`btn btn-circle btn-lg ${isVideoOff ? "bg-white text-black" : "bg-white/20 text-white"} border-none`}
          >
            {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
        <button
          onClick={endCall}
          className="btn btn-circle btn-lg bg-red-500 hover:bg-red-600 border-none text-white"
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
};

export default CallManager;
