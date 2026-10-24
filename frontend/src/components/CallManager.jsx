import CallReturnBar from "./CallReturnBar";
import { useBackToClose } from "../lib/useBackToClose";
import { useEffect, useRef, useState } from "react";
import { optimizeImage } from "../lib/cdn";
import { useCallStore } from "../store/useCallStore";
import {
  UploadCloud,
  MoreHorizontal,
  Minimize2,
  Lock,
  SwitchCamera,
  UserPlus,
} from "lucide-react";
import AddParticipantModal from "./AddParticipantModal";
import AudioRoutePicker, { routeLabel } from "./AudioRoutePicker";
import { useGroupCallStore } from "../store/useGroupCallStore";
import { isPhoneLike } from "../lib/device";
import { signalCallConnected } from "../lib/notificationSound";
import { Phone, PhoneEnd, Video, VideoOff, Mic, MicOff, Volume2 } from "./icons/WaGlyphs";
import toast from "react-hot-toast";
import { TRANSPARENT_POSTER } from "../lib/utils";

const AVATAR_COLORS = ["#00695C", "#4527A0", "#AD1457", "#2E7D32", "#1565C0", "#EF6C00"];
const colorForName = (name = "") => {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

// Full-screen backdrop for a call: the other person's photo edge to edge (fitted to the
// screen, never stretched), under a dark gradient so the name, timer and buttons stay
// readable. Small photos would look pixelated when enlarged, so those are softly blurred.
// Without a photo: a plain dark gradient.
const CallBackdrop = ({ user }) => {
  const [soft, setSoft] = useState(false);
  const [ready, setReady] = useState(false);
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#0b141a]" aria-hidden>
      {user?.profilePic && (
        <img
          key={user.profilePic}
          src={optimizeImage(user.profilePic, 1080)}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setSoft(img.naturalWidth < window.innerWidth * 0.9 || img.naturalHeight < window.innerHeight * 0.6);
            setReady(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"} ${soft ? "scale-110 blur-xl" : ""}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-black/75" />
    </div>
  );
};

// Big avatar with a colored-letter fallback (matches WhatsApp's style when
// a contact has no photo) instead of a generic silhouette.
const CallAvatar = ({ user, size = "size-28" }) => {
  if (user?.profilePic) {
    return <img src={optimizeImage(user.profilePic, 120)} loading="lazy" decoding="async" alt={user.fullName} className={`${size} rounded-full object-cover`} />;
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

// Full-screen incoming call (the caller's photo behind). Each button can be tapped OR dragged: it follows the
// finger, the whole screen washes into that action's colour (green = answering, red = declining), and letting go
// past the threshold does it; letting go early springs the button back.
const DRAG_MAX = 130;
const DRAG_DO = 80;
const IncomingCallScreen = ({ user, callType, onAccept, onReject }) => {
  const [drag, setDrag] = useState({ kind: null, x: 0, y: 0 });
  const start = useRef(null);
  const done = useRef(false);
  const dist = Math.min(DRAG_MAX, Math.hypot(drag.x, drag.y));
  const strength = dist / DRAG_MAX;
  const tint = drag.kind === "accept" ? "0 168 132" : drag.kind === "decline" ? "239 68 68" : null;

  const fire = (kind) => {
    if (done.current) return;
    done.current = true;
    if (kind === "accept") onAccept();
    else onReject();
  };

  const handlers = (kind) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      setDrag({ kind, x: 0, y: 0 });
    },
    onPointerMove: (e) => {
      const st = start.current;
      if (!st || st.id !== e.pointerId) return;
      let dx = e.clientX - st.x;
      let dy = e.clientY - st.y;
      const d = Math.hypot(dx, dy);
      if (d > DRAG_MAX) {
        dx = (dx / d) * DRAG_MAX;
        dy = (dy / d) * DRAG_MAX;
      }
      setDrag({ kind, x: dx, y: dy });
    },
    onPointerUp: (e) => {
      const st = start.current;
      if (!st || st.id !== e.pointerId) return;
      start.current = null;
      const moved = Math.hypot(drag.x, drag.y);
      setDrag({ kind: null, x: 0, y: 0 });
      if (moved >= DRAG_DO || moved < 10) fire(kind); // dragged far enough, or a plain tap
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag({ kind: null, x: 0, y: 0 });
    },
  });

  const dragging = !!drag.kind && dist > 12;
  const label = dragging ? (drag.kind === "accept" ? "Answering…" : "Declining…") : null;
  const btnStyle = (kind) => {
    const on = drag.kind === kind;
    return {
      transform: on ? `translate(${drag.x}px, ${drag.y}px) scale(${1 + strength * 0.18})` : drag.kind ? "scale(.9)" : undefined,
      transition: on && start.current ? "none" : "transform .25s cubic-bezier(.2,1.2,.4,1), opacity .2s",
      opacity: drag.kind && !on ? 0.45 : 1,
      touchAction: "none",
    };
  };

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col isolate text-white select-none">
      <CallBackdrop user={user} />
      {/* colour wash that follows the drag */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: tint ? `rgb(${tint} / ${(0.08 + strength * 0.62).toFixed(2)})` : "transparent", transition: start.current ? "none" : "background .25s" }}
      />

      <div className="relative flex flex-col items-center pt-[calc(56px+env(safe-area-inset-top))] px-6 text-center">
        <h3 className="text-[28px] leading-tight font-semibold drop-shadow max-w-[84vw] truncate">{user?.fullName}</h3>
        <p className="text-[16px] text-white/90 mt-1 drop-shadow">{label || `Incoming ${callType === "video" ? "video" : "voice"} call…`}</p>
        <p className="text-xs text-white/70 flex items-center gap-1 mt-1.5">
          <Lock size={10} /> End-to-end encrypted
        </p>
      </div>

      {!user?.profilePic && (
        <div className="relative flex-1 flex items-center justify-center">
          <span className="absolute size-44 rounded-full bg-[#00A884]/25 animate-ping" />
          <CallAvatar user={user} size="size-36" />
        </div>
      )}
      {user?.profilePic && <div className="flex-1" />}

      <div className="relative flex items-end justify-between px-12 pb-[calc(56px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-2.5">
          <button
            {...handlers("decline")}
            style={btnStyle("decline")}
            className="size-[72px] rounded-full flex items-center justify-center bg-red-500 text-white shadow-[0_10px_30px_-8px_rgba(239,68,68,.8)] cursor-grab"
            aria-label="Decline call"
          >
            <PhoneEnd size={30} />
          </button>
          <span className="text-[13px] text-white/90 drop-shadow">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <button
            {...handlers("accept")}
            style={btnStyle("accept")}
            className={`size-[72px] rounded-full flex items-center justify-center bg-[#25D366] text-white shadow-[0_10px_30px_-8px_rgba(37,211,102,.85)] cursor-grab ${drag.kind ? "" : "animate-pulse"}`}
            aria-label="Answer call"
          >
            {callType === "video" ? <Video size={30} /> : <Phone size={28} />}
          </button>
          <span className="text-[13px] text-white/90 drop-shadow">Answer</span>
        </div>
      </div>
      <p className="relative text-center text-[11.5px] text-white/60 -mt-9 pb-[calc(10px+env(safe-area-inset-bottom))]">Tap, or drag a button to answer or decline</p>
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
const gridBtnOff = `${gridBtnBase} bg-[rgba(255,255,255,0.18)] text-[#FFFFFF] active:bg-[rgba(255,255,255,0.28)]`;
const gridBtnOn = `${gridBtnBase} call-btn-on bg-[#FFFFFF] text-[#0B141A]`;
const gridBtn = gridBtnOff;
const callBtn = (active) => (active ? gridBtnOn : gridBtnOff);

// soft expanding rings behind the avatar while the call is placed
const Ripples = () => (
  <>
    {[0, 1, 2].map((n) => (
      <span
        key={n}
        className="absolute inset-0 rounded-full bg-[#00A884]/40"
        style={{ animation: "callRipple 2.4s ease-out infinite", animationDelay: `${n * 0.8}s` }}
      />
    ))}
  </>
);

// "Calling" / "Ringing" with three softly pulsing dots, like WhatsApp
const PulseDots = ({ word }) => (
  <span className="inline-flex items-baseline">
    {word}
    {[0, 1, 2].map((n) => (
      <span key={n} className="inline-block" style={{ animation: "callDot 1.4s infinite", animationDelay: `${n * 0.22}s` }}>
        .
      </span>
    ))}
    <style>{"@keyframes callDot{0%,60%,100%{opacity:.25}30%{opacity:1}}@keyframes callRipple{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.9);opacity:0}}"}</style>
  </span>
);

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
    audioRoutes,
    audioRoute,
    autoAnswer,
    isAnswering,
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
  // Phone Back button shrinks the call to the green bar instead of leaving the app.
  useBackToClose(callStatus !== "idle" && callStatus !== "incoming" && !isMinimized, () => setIsMinimized(true));
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [adding, setAdding] = useState(false);
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

    // The voice always comes out of the dedicated <audio> element, for voice AND video calls and
    // whether the call is full-screen or minimized (a video call used to go silent when minimized,
    // because only the <video> element — gone while minimized — carried the sound). The <video>
    // element only shows the picture, so the voice is never played twice.
    if (remoteStream && remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStream) remoteAudioRef.current.srcObject = remoteStream;
      tryPlay(remoteAudioRef.current);
    }
    if (callType === "video" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.muted = true;
      remoteVideoRef.current.srcObject = remoteStream;
      tryPlay(remoteVideoRef.current);
    }
  }, [remoteStream, callType, isMinimized, callStatus]);

  // Keep the call audible: while connected, if the browser paused / muted the
  // playback element (tab switch, Bluetooth change, autoplay policy), start it again.
  useEffect(() => {
    if (callStatus !== "in-call" || !remoteStream) return undefined;
    const heal = () => {
      [remoteAudioRef.current, remoteVideoRef.current].forEach((el) => {
        if (!el || !el.srcObject) return;
        if (el.volume !== 1) el.volume = 1;
        if (el.paused) el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
      });
    };
    const t = setInterval(heal, 1500);
    remoteStream.getAudioTracks().forEach((tr) => tr.addEventListener("unmute", heal));
    document.addEventListener("visibilitychange", heal);
    return () => {
      clearInterval(t);
      remoteStream.getAudioTracks().forEach((tr) => tr.removeEventListener("unmute", heal));
      document.removeEventListener("visibilitychange", heal);
    };
  }, [callStatus, remoteStream]);

  const unblockAudio = () => {
    [remoteAudioRef.current, remoteVideoRef.current].forEach((el) => el?.play().catch(() => {}));
    setAudioBlocked(false);
  };

  useEffect(() => {
    if (callStatus === "idle") setIsMinimized(false);
  }, [callStatus]);

  // The call was picked up: stop every ring / ringing buzz, give ONE short buzz and a quick green
  // blink of the screen, then the call carries on cleanly.
  const [connectFlash, setConnectFlash] = useState(false);
  const wasInCall = useRef(false);
  useEffect(() => {
    if (callStatus === "in-call" && !wasInCall.current) {
      wasInCall.current = true;
      signalCallConnected();
      setConnectFlash(true);
      const t = setTimeout(() => setConnectFlash(false), 420);
      return () => clearTimeout(t);
    }
    if (callStatus === "idle") wasInCall.current = false;
    return undefined;
  }, [callStatus]);

  // "Answer" was tapped on the notification and the call is still on its way to this phone:
  // show that it is connecting (nothing to tap) instead of the home screen.
  if (callStatus === "idle" && autoAnswer && Date.now() < autoAnswer.until) {
    return (
      <div
        className="wa-dark fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 text-white"
        style={{ background: "linear-gradient(160deg, #0A7A67 0%, #00A884 55%, #25D366 130%)" }}
      >
        <img
          src="/icon-v2-192.png"
          alt="Talkies"
          className="size-24 rounded-[26px] shadow-2xl"
          style={{ boxShadow: "0 18px 40px -12px rgb(0 0 0 / .45)" }}
        />
        <p className="text-[19px] font-semibold tracking-wide">Opening…</p>
        <button onClick={() => useCallStore.setState({ autoAnswer: null })} className="mt-2 h-10 px-7 rounded-full text-[14px]" style={{ background: "rgb(255 255 255 / .22)" }}>
          Cancel
        </button>
      </div>
    );
  }

  if (callStatus === "idle") return null;

  // ---- Incoming call ----
  if (callStatus === "incoming" && isAnswering) {
    return (
      <div className="wa-dark fixed inset-0 z-[200] bg-[#0b141a] flex flex-col items-center justify-center gap-5 text-white">
        <CallAvatar user={remoteUser} size="size-24" />
        <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
        <p className="text-[15px] text-white/70">Connecting…</p>
      </div>
    );
  }
  if (callStatus === "incoming") {
    return <IncomingCallScreen user={remoteUser} callType={callType} onAccept={acceptCall} onReject={rejectCall} />;
  }

  // ---- Minimized pill (tap to expand) ----
  if (isMinimized) {
    return (
      <>
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />
      {adding && (
        <AddParticipantModal
          excludeIds={[remoteUser?._id]}
          onClose={() => setAdding(false)}
          onAdd={(ids) => {
            setAdding(false);
            useGroupCallStore.getState().upgradeFromCall(ids);
          }}
        />
      )}
      <CallReturnBar
        video={callType === "video"}
        onClick={() => setIsMinimized(false)}
        detail={
          callStatus === "calling"
            ? isRemoteRinging
              ? "Ringing…"
              : "Calling…"
            : isReconnecting
              ? "Reconnecting…"
              : callDuration || "In call"
        }
      />
      </>
    );
  }

  // ---- Outgoing / active call ----
  const isVideo = callType === "video";
  // While someone shares their screen the picture needs every pixel it can get: slim header, one row of buttons.
  const compact = isVideo && remoteScreenSharing;
  // With a profile photo the whole screen is their photo (like WhatsApp): no small circle photo,
  // and the name + "Ringing…"/timer live together at the top.
  const hasPhoto = !!remoteUser?.profilePic;
  const canFlip = isVideo && isPhoneLike() && !isVideoOff && !isScreenSharing;
  const statusText =
    callStatus === "calling"
      ? <PulseDots word={isRemoteRinging ? "Ringing" : "Calling"} />
      : isReconnecting
        ? "Reconnecting…"
        : callDuration || (isVideo ? "Video call" : "Voice call");

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col isolate">
      <audio id="call-remote-audio" ref={remoteAudioRef} autoPlay />
      {connectFlash && (
        <div className="pointer-events-none fixed inset-0 z-[230]" style={{ background: "rgb(37 211 102 / .38)" }} aria-hidden />
      )}
      {adding && (
        <AddParticipantModal
          excludeIds={[remoteUser?._id]}
          onClose={() => setAdding(false)}
          onAdd={(ids) => {
            setAdding(false);
            useGroupCallStore.getState().upgradeFromCall(ids);
          }}
        />
      )}
      {(!isVideo || !remoteStream) && <CallBackdrop user={remoteUser} />}
      <AudioRoutePicker />

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
      <div className={`shrink-0 flex items-center justify-between relative z-10 ${compact ? "px-3 pt-[calc(6px+env(safe-area-inset-top))] pb-1" : "px-4 pt-4 pb-2"}`}>
        <button
          onClick={() => setIsMinimized(true)}
          className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
        >
          <Minimize2 size={18} />
        </button>
        <div className="text-center">
          <h3 className={hasPhoto ? "text-white text-[22px] leading-tight font-semibold drop-shadow max-w-[62vw] truncate" : "text-white font-medium"}>
            {remoteUser?.fullName}
          </h3>
          {hasPhoto && <p className="text-[15px] text-white/90 mt-0.5 tabular-nums drop-shadow">{statusText}</p>}
          {compact ? (
            <p className="text-[13px] text-white/80 tabular-nums">{statusText}</p>
          ) : (
            <p className="text-xs text-white/60 flex items-center justify-center gap-1 mt-0.5">
              <Lock size={10} /> End-to-end encrypted
            </p>
          )}
          {isScreenSharing && (
            <p className="text-xs text-[#00A884] flex items-center justify-center gap-1 mt-0.5">
              <UploadCloud size={11} /> You&apos;re sharing your screen
            </p>
          )}
          {remoteMuted && callStatus === "in-call" && (
            <p className="text-xs text-amber-300 flex items-center justify-center gap-1 mt-0.5">
              <MicOff size={11} /> {remoteUser?.fullName?.split(" ")[0] || "They"} muted their mic
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canFlip && (
            <button
              onClick={flipCamera}
              className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
              aria-label="Switch camera"
            >
              <SwitchCamera size={20} />
            </button>
          )}
          {callStatus === "in-call" ? (
            <button
              onClick={() => setAdding(true)}
              className="size-11 rounded-full flex items-center justify-center bg-black/30 text-white"
              aria-label="Add participant"
            >
              <UserPlus size={20} />
            </button>
          ) : (
            !canFlip && <span className="size-11" aria-hidden />
          )}
        </div>
      </div>

      {isVideo ? (
        <div className={`relative flex-1 min-h-0 overflow-hidden ${remoteStream ? "bg-black" : ""}`}>
          <video
            id="call-remote-video"
            ref={remoteVideoRef}
            autoPlay
            muted
            playsInline
            poster={TRANSPARENT_POSTER}
            style={{ visibility: remoteStream ? "visible" : "hidden" }}
            // A shared screen must not be cropped like a camera feed is.
            className={`absolute inset-0 w-full h-full ${remoteScreenSharing ? "object-contain bg-black" : "object-cover"}`}
          />
          {remoteScreenSharing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <UploadCloud size={12} /> {remoteUser?.fullName?.split(" ")[0] || "They"} is sharing their screen
            </div>
          )}
          {!remoteStream && !hasPhoto && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white drop-shadow">
              <div className="relative mb-4">
                {callStatus === "calling" && <Ripples />}
                <CallAvatar user={remoteUser} />
              </div>
              <p className="text-lg font-medium">{remoteUser?.fullName}</p>
              <p className="text-sm text-wa-muted mt-1 tabular-nums">{statusText}</p>
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
      ) : hasPhoto ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white">
          <div className="relative mb-4">
            {callStatus === "calling" && <Ripples />}
            <CallAvatar user={remoteUser} />
          </div>
          <h3 className="text-xl font-semibold">{remoteUser?.fullName}</h3>
          <p className="text-sm text-white/70 mt-1 tabular-nums">{statusText}</p>
        </div>
      )}

      {/* Bottom control panel — 2x3 grid matching WhatsApp:
          Speaker / Video / Mute
          More    / Share / End */}
      <div className={`relative shrink-0 bg-black/50 rounded-t-3xl px-4 ${compact ? "pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]" : "px-6 pt-6 pb-[calc(32px+env(safe-area-inset-bottom))]"}`}>
        <div className={compact ? "grid grid-cols-6 gap-x-1 max-w-md mx-auto [&>div>button]:!size-12 [&>div>span]:hidden" : "grid grid-cols-3 gap-x-6 gap-y-5 max-w-xs mx-auto"}>
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleSpeakerOutput} className={callBtn(isSpeakerOn)}>
              <Volume2 size={24} />
            </button>
            <span className="text-xs text-white/70">{audioRoutes.length && audioRoute ? routeLabel(audioRoutes, audioRoute) : "Speaker"}</span>
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
