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
  ScreenShare,
  ScreenShareOff,
} from "lucide-react";

const controlBtn = (active) =>
  `size-14 rounded-full flex items-center justify-center transition-colors ${
    active ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
  }`;

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
    audioOutputDevices,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    loadAudioOutputDevices,
    setAudioOutputDevice,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);

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
      <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
        <div className="bg-[#1F2C34] rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="relative mx-auto mb-4 size-24">
            <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
            <img
              src={remoteUser?.profilePic || "/avatar.png"}
              alt={remoteUser?.fullName}
              className="relative size-24 rounded-full object-cover ring-4 ring-[#00A884]/40"
            />
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

  // ---- Outgoing / active call ----
  const isVideo = callType === "video";
  const statusText =
    callStatus === "calling" ? (isRemoteRinging ? "Ringing…" : "Calling…") : isVideo ? "Video call" : "Voice call · connected";

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B141A] flex flex-col">
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />

      {isVideo ? (
        <div className="relative flex-1 bg-black">
          <video
            id="call-remote-video"
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="relative mb-4 size-24">
                {callStatus === "calling" && (
                  <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
                )}
                <img
                  src={remoteUser?.profilePic || "/avatar.png"}
                  alt={remoteUser?.fullName}
                  className="relative size-24 rounded-full object-cover"
                />
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
          <div className="relative mb-4 size-28">
            {callStatus === "calling" && (
              <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
            )}
            <img
              src={remoteUser?.profilePic || "/avatar.png"}
              alt={remoteUser?.fullName}
              className="relative size-28 rounded-full object-cover ring-4 ring-white/10"
            />
          </div>
          <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
          <p className="text-sm text-white/70 mt-1">{statusText}</p>
        </div>
      )}

      {/* Control row — mirrors WhatsApp's call-screen layout: secondary
          controls (mute, speaker, video, screen share) in a row, End Call
          as the distinct larger red button */}
      <div className="p-6 sm:p-8 bg-black/40">
        <div className="flex items-center justify-center gap-4 sm:gap-6 mb-5">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleMute} className={controlBtn(isMuted)}>
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <span className="text-[11px] text-white/70">{isMuted ? "Unmute" : "Mute"}</span>
          </div>

          <div className="relative flex flex-col items-center gap-1.5">
            <button
              onClick={() => {
                loadAudioOutputDevices();
                setShowSpeakerMenu((s) => !s);
              }}
              className={controlBtn(false)}
            >
              <Volume2 size={22} />
            </button>
            <span className="text-[11px] text-white/70">Speaker</span>

            {showSpeakerMenu && (
              <div className="absolute bottom-full mb-2 bg-[#233138] rounded-xl shadow-2xl py-1.5 w-56 z-10">
                {audioOutputDevices.length === 0 ? (
                  <p className="text-xs text-[#8696A0] px-4 py-2">
                    Output picker isn&apos;t supported in this browser
                  </p>
                ) : (
                  audioOutputDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      onClick={() => {
                        setAudioOutputDevice(d.deviceId);
                        setShowSpeakerMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-[#D1D7DB] hover:bg-white/5 truncate"
                    >
                      {d.label || "Audio output"}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {isVideo && (
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={toggleVideo} className={controlBtn(isVideoOff)}>
                {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
              <span className="text-[11px] text-white/70">Video</span>
            </div>
          )}

          {isVideo && (
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={toggleScreenShare} className={controlBtn(isScreenSharing)}>
                {isScreenSharing ? <ScreenShareOff size={22} /> : <ScreenShare size={22} />}
              </button>
              <span className="text-[11px] text-white/70">Share</span>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={endCall}
            className="size-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white"
          >
            <PhoneOff size={26} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallManager;
