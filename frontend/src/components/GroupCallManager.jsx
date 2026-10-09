import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, PhoneOff, Phone, Users, SwitchCamera } from "lucide-react";
import { isPhoneLike } from "../lib/device";
import { useGroupCallStore, canShareScreen, MAX_GROUP_CALL } from "../store/useGroupCallStore";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import Avatar from "./Avatar";

// Same control look as 1-to-1 calls: dark circle, solid white while "on".
const btnBase = "size-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95";
const btnOff = `${btnBase} bg-white/10 hover:bg-white/15 text-white`;
const btnOn = `${btnBase} bg-white hover:bg-white/90 text-wa-bg shadow-lg shadow-white/10`;
const ctl = (on) => (on ? btnOn : btnOff);

const fmt = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const useElapsed = (startedAt) => {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return sec;
};

const hasLiveVideo = (stream) => !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

const Tile = ({ stream, name, label, pic, muted, videoOn, mirror, contain, self, connecting, small }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream || null)) ref.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className={`relative overflow-hidden bg-wa-surface min-h-0 min-w-0 ${small ? "rounded-xl" : "rounded-2xl"}`}>
      {/* Always rendered: it also carries the person's voice, even with no picture */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={self}
        className={`absolute inset-0 size-full ${contain ? "object-contain bg-black" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${
          videoOn ? "" : "opacity-0"
        }`}
      />
      {!videoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar src={pic} name={name} size={small ? "size-12" : "size-24"} textSize={small ? "text-xl" : "text-4xl"} />
        </div>
      )}
      <div className="absolute left-2 bottom-2 right-2 flex items-center gap-1.5 pointer-events-none">
        <span className="max-w-full truncate rounded-full bg-black/55 px-2.5 py-1 text-[12.5px] text-white flex items-center gap-1">
          {muted && <MicOff size={13} className="shrink-0" />}
          <span className="truncate">{label ?? (self ? "You" : name)}</span>
        </span>
      </div>
      {connecting && !self && (
        <div className="absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[12px] text-white/90">Connecting…</div>
      )}
    </div>
  );
};

const Incoming = () => {
  const incoming = useGroupCallStore((s) => s.incoming);
  const status = useGroupCallStore((s) => s.status);
  const accept = useGroupCallStore((s) => s.acceptIncoming);
  const decline = useGroupCallStore((s) => s.declineIncoming);
  if (!incoming || status !== "idle") return null;
  const isVideo = incoming.callType === "video";

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col items-center justify-between py-16 px-6">
      <div className="flex flex-col items-center text-center">
        <p className="text-[15px] text-wa-muted mb-6">Group {isVideo ? "video" : "voice"} call</p>
        <Avatar src={incoming.groupPic} name={incoming.groupName} isGroup size="size-32" textSize="text-5xl" />
        <h2 className="mt-6 text-[28px] text-wa-text max-w-full truncate">{incoming.groupName}</h2>
        <p className="mt-2 text-[16px] text-wa-muted">{incoming.from?.fullName || "Someone"} is calling…</p>
      </div>
      <div className="flex items-center gap-16">
        <div className="flex flex-col items-center gap-2">
          <button onClick={decline} className="size-16 rounded-full bg-[#F15C6D] text-white flex items-center justify-center active:scale-95" aria-label="Decline">
            <PhoneOff size={28} />
          </button>
          <span className="text-[13px] text-wa-muted">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={accept} className="size-16 rounded-full bg-[#21C063] text-wa-bg flex items-center justify-center active:scale-95" aria-label="Join">
            {isVideo ? <Video size={28} /> : <Phone size={28} />}
          </button>
          <span className="text-[13px] text-wa-muted">Join</span>
        </div>
      </div>
    </div>
  );
};

const Active = () => {
  const {
    status,
    groupName,
    groupPic,
    startedAt,
    tiles,
    localVideo,
    isMuted,
    cameraOn,
    isScreenSharing,
    leave,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    cameraFacing,
    flipCamera,
  } = useGroupCallStore();
  const authUser = useAuthStore((s) => s.authUser);
  const users = useChatStore((s) => s.users);
  const elapsed = useElapsed(startedAt);

  if (status === "idle") return null;

  const nameOf = (id, tile) =>
    tile?.profile?.fullName || users.find((u) => u._id === id)?.fullName || "Participant";
  const picOf = (id, tile) => tile?.profile?.profilePic || users.find((u) => u._id === id)?.profilePic || "";

  const me = {
    id: "me",
    self: true,
    stream: localVideo,
    name: authUser?.fullName || "You",
    pic: authUser?.profilePic,
    muted: isMuted,
    videoOn: !!localVideo,
    mirror: !isScreenSharing && cameraFacing === "user",
    contain: isScreenSharing,
    sharing: isScreenSharing,
  };
  const others = Object.entries(tiles).map(([id, t]) => ({
    id,
    self: false,
    stream: t.stream,
    name: nameOf(id, t),
    pic: picOf(id, t),
    muted: !!t.muted,
    videoOn: hasLiveVideo(t.stream) && t.videoOff !== true,
    contain: !!t.screen,
    sharing: !!t.screen,
    connecting: !t.connected,
  }));
  const all = [me, ...others];
  const spot = all.find((t) => t.sharing);
  const count = all.length;

  const gridCls =
    count <= 1 ? "grid-cols-1" : count === 2 ? "grid-cols-1 md:grid-cols-2" : count <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  const renderTile = (t, small) => (
    <Tile key={t.id} {...t} small={small} />
  );

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2 shrink-0">
        <Avatar src={groupPic} name={groupName} isGroup size="size-10" textSize="text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] text-wa-text truncate">{groupName}</p>
          <p className="text-[13px] text-wa-muted flex items-center gap-1.5">
            <Users size={13} /> {status === "joining" ? "Connecting…" : `${count} in call · ${fmt(elapsed)}`}
          </p>
        </div>
        <span className="text-[12px] text-wa-muted2">max {MAX_GROUP_CALL}</span>
      </div>

      {spot ? (
        <div className="flex-1 min-h-0 flex flex-col gap-2 px-2 pb-2">
          <div className="flex-1 min-h-0 grid">{renderTile({ ...spot, label: spot.self ? "Your screen" : `${spot.name}'s screen` })}</div>
          <div className="h-24 shrink-0 flex gap-2 overflow-x-auto">
            {all
              .filter((t) => t.id !== spot.id)
              .map((t) => (
                <div key={t.id} className="w-32 shrink-0 grid">
                  {renderTile(t, true)}
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className={`flex-1 min-h-0 grid ${gridCls} auto-rows-fr gap-2 px-2 pb-2`}>{all.map((t) => renderTile(t))}</div>
      )}

      <div className="shrink-0 flex items-center justify-center gap-4 px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] bg-wa-panel rounded-t-3xl">
        <button onClick={toggleMute} className={ctl(isMuted)} aria-label={isMuted ? "Unmute" : "Mute"}>
          {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
        </button>
        <button onClick={toggleCamera} className={ctl(!cameraOn)} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>
          {cameraOn ? <Video size={26} /> : <VideoOff size={26} />}
        </button>
        {isPhoneLike() && cameraOn && !isScreenSharing && (
          <button onClick={flipCamera} className={ctl(false)} aria-label="Switch camera">
            <SwitchCamera size={26} />
          </button>
        )}
        {(canShareScreen() || isPhoneLike()) && (
          <button onClick={toggleScreenShare} className={ctl(isScreenSharing)} aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}>
            {isScreenSharing ? <ScreenShareOff size={26} /> : <ScreenShare size={26} />}
          </button>
        )}
        <button onClick={leave} className="size-16 rounded-full bg-[#F15C6D] hover:bg-[#e04a5b] text-white flex items-center justify-center active:scale-95" aria-label="Leave call">
          <PhoneOff size={28} />
        </button>
      </div>
    </div>
  );
};

const GroupCallManager = () => (
  <>
    <Incoming />
    <Active />
  </>
);

export default GroupCallManager;
