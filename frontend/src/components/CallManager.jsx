import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import {
  UploadCloud,
  MoreHorizontal,
  Minimize2,
  Lock,
  SwitchCamera,
} from "lucide-react";
import { isPhoneLike } from "../lib/device";
import { Phone, PhoneEnd, Video, VideoOff, Mic, MicOff, Volume2 } from "./icons/WaGlyphs";
import toast from "react-hot-toast";
import { TRANSPARENT_POSTER } from "../lib/utils";

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

// Formats elapsed seconds as m:ss, or h:mm:ss once a call passes an hour.
const formatDuration = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = String(totalSeconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Live-updating elapsed time since the call connected (null until then).
const useCallDuration = (startedAt) => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? formatDuration(seconds) : null;
};

// Keeps the screen awake while a call is active so phones don't sleep (and
// drop the call UI) mid-call. Browsers release the lock whenever the tab is
// hidden, so it's re-requested when the page becomes visible again. Silently
// does nothing where the Screen Wake Lock API isn't supported.
const useCallWakeLock = (active) => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // denied (e.g. low battery saver mode) — the call still works
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
};

// WhatsApp call controls: a dark circle normally, a solid white circle with a
// dark icon while the control is on (speaker on, muted, camera off, sharing).
// The two states are separate full class strings — mixing bg-white/10 and
// bg-white on one element leaves the winner up to stylesheet order.
const gridBtnBase = "size-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95";
const gridBtnOff = `${gridBtnBase} bg-white/10 hover:bg-white/15 text-white`;
const gridBtnOn = `${gridBtnBase} bg-white hover:bg-white/90 text-wa-bg shadow-lg shadow-white/10`;
const gridBtn = gridBtnOff;
const callBtn = (active) => (active ? gridBtnOn : gridBtnOff);

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
    callStartedAt,
    isReconnecting,
    remoteMuted,
    remoteScreenSharing,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    flipCamera,
    toggleSpeakerOutput,
    upgradeToVideo,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const callDuration = useCallDuration(callStartedAt);
  useCallWakeLock(callStatus === "calling" || callStatus === "in-call");

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  // Explicitly call .play() and surface a "tap to enable audio" prompt if
  // the browser blocks it — assigning srcObject inside a React effect can
  // land just outside the window browsers consider a direct user gesture,
  // silently blocking autoplay (audio/video looks connected, but nothing
  // is heard). This is likely the source of "call connects but no sound"
  // on some browsers even with a TURN server in place.
  useEffect(() => {
    const tryPlay = async (el) => {
      if (!el) return;
      try {
        await el.play();
        setAudioBlocked(false);
      } catch {
        setAudioBlocked(true);
      }
    };

    if (callType === "video" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      tryPlay(remoteVideoRef.current);
    }
    if (callType === "audio" && remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      tryPlay(remoteAudioRef.current);
    }
  }, [remoteStream, callType, isMinimized, callStatus]);

  const unblockAudio = () => {
    [remoteAudioRef.current, remoteVideoRef.current].forEach((el) => el?.play().catch(() => {}));
    setAudioBlocked(false);
  };

  useEffect(() => {
    if (callStatus === "idle") setIsMinimized(false);
  }, [callStatus]);

  if (callStatus === "idle") return null;

  // ---- Incoming call ----
  if (callStatus === "incoming") {
    return (
      <div className="wa-dark fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
        <div className="bg-wa-surface rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="relative mx-auto mb-4 size-24">
            <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
            <div className="relative">
              <CallAvatar user={remoteUser} size="size-24" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-white">{remoteUser?.fullName}</h3>
          <p className="text-sm text-wa-muted mb-6">
            Incoming {callType === "video" ? "video" : "voice"} call…
          </p>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={rejectCall}
                className="size-16 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white"
              >
                <PhoneEnd size={28} />
              </button>
              <span className="text-xs text-wa-muted">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={acceptCall}
                className="size-16 rounded-full flex items-center justify-center bg-[#00A884] hover:bg-[#02906f] text-white animate-pulse"
              >
                <Phone size={26} />
              </button>
              <span className="text-xs text-wa-muted">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Minimized pill (tap to expand) ----
  if (isMinimized) {
    return (
      <>
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-wa-surface rounded-full pl-2 pr-4 py-2 flex items-center gap-2 shadow-2xl"
      >
        <CallAvatar user={remoteUser} size="size-8" />
        <span className="text-wa-text text-sm font-medium">{remoteUser?.fullName}</span>
        <span className="text-[#00A884] text-xs">
          {callStatus === "calling"
            ? isRemoteRinging
              ? "Ringing…"
              : "Calling…"
            : isReconnecting
              ? "Reconnecting…"
              : callDuration || "In call"}
        </span>
      </button>
      </>
    );
  }

  // ---- Outgoing / active call ----
  const isVideo = callType === "video";
  const canFlip = isVideo && isPhoneLike() && !isVideoOff && !isScreenSharing;
  const statusText =
    callStatus === "calling"
      ? isRemoteRinging
        ? "Ringing…"
        : "Calling…"
      : isReconnecting
        ? "Reconnecting…"
        : callDuration || (isVideo ? "Video call" : "Voice call");

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col">
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />

      {audioBlocked && (
        <button
          onClick={unblockAudio}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-black text-sm font-medium px-4 py-2 rounded-full shadow-lg"
        >
          🔇 Tap to enable audio
        </button>
      )}

      {isReconnecting && callStatus === "in-call" && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-black text-sm font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <span className="size-2 rounded-full bg-black animate-pulse" /> Reconnecting…
        </div>
      )}

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
          {isScreenSharing && (
            <p className="text-xs text-[#00A884] flex items-center justify-center gap-1 mt-0.5">
              <UploadCloud size={11} /> You're sharing your screen
            </p>
          )}
          {remoteMuted && callStatus === "in-call" && (
            <p className="text-xs text-amber-300 flex items-center justify-center gap-1 mt-0.5">
              <MicOff size={11} /> {remoteUser?.fullName?.split(" ")[0] || "They"} muted their mic
            </p>
          )}
        </div>
        {canFlip ? (
          <button
            onClick={flipCamera}
            className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
            aria-label="Switch camera"
          >
            <SwitchCamera size={20} />
          </button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>

      {isVideo ? (
        <div className="relative flex-1 bg-black">
          <video
            id="call-remote-video"
            ref={remoteVideoRef}
            autoPlay
            playsInline
            poster={TRANSPARENT_POSTER}
            style={{ visibility: remoteStream ? "visible" : "hidden" }}
            // A shared screen must not be cropped like a camera feed is.
            className={`w-full h-full ${remoteScreenSharing ? "object-contain bg-black" : "object-cover"}`}
          />
          {remoteScreenSharing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <UploadCloud size={12} /> {remoteUser?.fullName?.split(" ")[0] || "They"} is sharing their screen
            </div>
          )}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="relative mb-4">
                {callStatus === "calling" && (
                  <span className="absolute inset-0 rounded-full bg-[#00A884]/30 animate-ping" />
                )}
                <CallAvatar user={remoteUser} />
              </div>
              <p className="text-lg font-medium">{remoteUser?.fullName}</p>
              <p className="text-sm text-wa-muted mt-1">{statusText}</p>
            </div>
          )}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            poster={TRANSPARENT_POSTER}
            style={{ visibility: localStream ? "visible" : "hidden" }}
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
            <button onClick={toggleSpeakerOutput} className={callBtn(isSpeakerOn)}>
              <Volume2 size={24} />
            </button>
            <span className="text-xs text-white/70">Speaker</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={isVideo ? toggleVideo : upgradeToVideo}
              className={callBtn(isVideo && isVideoOff)}
            >
              {isVideo && isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
            </button>
            <span className="text-xs text-white/70">Video</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleMute} className={callBtn(isMuted)}>
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
              <div className="absolute bottom-full mb-2 bg-wa-pop rounded-xl shadow-2xl py-1.5 w-44 z-10">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setIsMinimized(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-wa-text2 hover:bg-white/5"
                >
                  Switch to chat
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={isVideo ? toggleScreenShare : () => toast("Screen share needs a video call", { icon: "🖥️" })}
              className={callBtn(isScreenSharing)}
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
              <PhoneEnd size={28} />
            </button>
            <span className="text-xs text-white/70">End</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallManager;
