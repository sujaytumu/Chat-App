import toast from "react-hot-toast";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, PhoneOff, Phone, SwitchCamera, UserPlus, Users, Lock } from "lucide-react";
import { isPhoneLike } from "../lib/device";
import { useGroupCallStore, canShareScreen, MAX_GROUP_CALL } from "../store/useGroupCallStore";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import Avatar from "./Avatar";
import { TRANSPARENT_POSTER } from "../lib/utils";

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
        poster={TRANSPARENT_POSTER}
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
        <span className="max-w-full truncate rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] text-white flex items-center gap-1">
          {muted && <MicOff size={13} className="shrink-0" />}
          <span className="truncate">{label ?? (self ? "You" : name)}</span>
        </span>
      </div>
      {connecting && !self && (
        <div className="absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/90">Connecting…</div>
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
        <p className="text-[13px] text-wa-muted mb-6">Group {isVideo ? "video" : "voice"} call</p>
        <Avatar src={incoming.groupPic} name={incoming.groupName} isGroup size="size-32" textSize="text-5xl" />
        <h2 className="mt-6 text-[24px] text-wa-text max-w-full truncate">{incoming.groupName}</h2>
        <p className="mt-2 text-[13.5px] text-wa-muted">{incoming.from?.fullName || "Someone"} is calling…</p>
      </div>
      <div className="flex items-center gap-16">
        <div className="flex flex-col items-center gap-2">
          <button onClick={decline} className="size-16 rounded-full bg-[#F15C6D] text-white flex items-center justify-center active:scale-95" aria-label="Decline">
            <PhoneOff size={28} />
          </button>
          <span className="text-[11px] text-wa-muted">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={accept} className="size-16 rounded-full bg-[#21C063] text-wa-bg flex items-center justify-center active:scale-95" aria-label="Join">
            {isVideo ? <Video size={28} /> : <Phone size={28} />}
          </button>
          <span className="text-[11px] text-wa-muted">Join</span>
        </div>
      </div>
    </div>
  );
};

// One labelled round control, same look as the 1-to-1 call screen.
const Ctl = ({ on, onClick, label, children, danger }) => (
  <div className="flex flex-col items-center gap-1.5 w-[84px]">
    <button
      onClick={onClick}
      aria-label={label}
      className={
        danger
          ? "size-[66px] rounded-full bg-[#F15C6D] hover:bg-[#e04a5b] text-white flex items-center justify-center active:scale-95 transition"
          : `${ctl(on).replace("size-16", "size-[66px]")}`
      }
    >
      {children}
    </button>
    <span className="text-[10px] text-wa-muted">{label}</span>
  </div>
);

// "Add participant": who is in the call right now, and who can be rung.
const ParticipantsSheet = ({ groupId, onClose }) => {
  const authUser = useAuthStore((s) => s.authUser);
  const group = useChatStore((s) => s.groups.find((g) => g._id === groupId));
  const inCall = useGroupCallStore((s) => s.states[groupId]?.participants) || [];
  const tiles = useGroupCallStore((s) => s.tiles);
  const ringMembers = useGroupCallStore((s) => s.ringMembers);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const [ringing, setRinging] = useState({}); // userId -> true while we wait for them
  const full = inCall.length >= MAX_GROUP_CALL;

  const joinedIds = new Set([authUser._id, ...inCall.map((p) => p._id), ...Object.keys(tiles)]);
  const members = (group?.members || []).filter((m) => (m._id || m) !== undefined && typeof m === "object");
  const joined = members.filter((m) => joinedIds.has(m._id));
  const rest = members.filter((m) => !joinedIds.has(m._id));

  const ring = async (ids) => {
    const rung = await ringMembers(ids);
    if (!rung.length) return;
    setRinging((r) => ({ ...r, ...Object.fromEntries(rung.map((id) => [id, true])) }));
    setTimeout(
      () => setRinging((r) => Object.fromEntries(Object.entries(r).filter(([id]) => !rung.includes(id)))),
      30000
    );
  };

  const Row = ({ m, right }) => (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <Avatar src={m.profilePic} name={m.fullName} size="size-11" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-wa-text truncate">{m._id === authUser._id ? "You" : m.fullName}</p>
        <p className="text-[11px] text-wa-muted">{right?.sub}</p>
      </div>
      {right?.node}
    </div>
  );

  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[78%] bg-wa-panel rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center px-5 py-3">
          <h3 className="flex-1 text-[16px] text-wa-text">Add participant</h3>
          <button onClick={onClose} className="text-[13px] text-[#21C063]">
            Done
          </button>
        </div>
        <div className="overflow-y-auto pb-4">
          <p className="px-5 pt-1 pb-1 text-[11px] text-wa-muted">In this call ({joined.length})</p>
          {joined.map((m) => (
            <Row key={m._id} m={m} right={{ sub: "Joined", node: <span className="size-2.5 rounded-full bg-[#21C063]" /> }} />
          ))}

          {rest.length > 0 && (
            <div className="flex items-center px-5 pt-4 pb-1">
              <p className="flex-1 text-[11px] text-wa-muted">Not in the call ({rest.length})</p>
              {!full && (
                <button onClick={() => ring(rest.map((m) => m._id))} className="text-[11.5px] text-[#21C063]">
                  Ring everyone
                </button>
              )}
            </div>
          )}
          {rest.map((m) => (
            <Row
              key={m._id}
              m={m}
              right={{
                sub: ringing[m._id] ? "Ringing…" : onlineUsers.includes(m._id) ? "Online" : "Offline",
                node: (
                  <button
                    disabled={full || ringing[m._id]}
                    onClick={() => ring([m._id])}
                    className="size-10 rounded-full bg-[#21C063] disabled:bg-white/10 disabled:text-wa-muted text-wa-bg flex items-center justify-center active:scale-95"
                    aria-label={`Ring ${m.fullName}`}
                  >
                    <Phone size={18} />
                  </button>
                ),
              }}
            />
          ))}
          {full && <p className="px-5 pt-3 text-[11px] text-wa-muted">This call is full ({MAX_GROUP_CALL} people).</p>}
        </div>
      </div>
    </div>
  );
};

const Active = () => {
  const {
    status,
    groupId,
    groupName,
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
  const [showPeople, setShowPeople] = useState(false);
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
  const renderTile = (t, small) => <Tile key={t.id} {...t} small={small} />;
  const canShare = canShareScreen() || isPhoneLike();

  return (
    <div className="wa-dark fixed inset-0 z-[200] bg-wa-bg flex flex-col">
      {/* Top bar: name + lock + timer in the middle, switch-camera on the right */}
      <div className="relative flex items-center justify-center px-14 pt-[calc(14px+env(safe-area-inset-top))] pb-2 shrink-0">
        <div className="text-center min-w-0">
          <p className="text-[14.5px] text-wa-text truncate">{groupName}</p>
          <p className="text-[10.5px] text-wa-muted flex items-center justify-center gap-1">
            <Lock size={11} />
            {status === "joining" ? "Connecting…" : `${fmt(elapsed)} · ${count} in call`}
          </p>
        </div>
        {isPhoneLike() && cameraOn && !isScreenSharing ? (
          <button
            onClick={flipCamera}
            className="absolute right-3 top-[calc(10px+env(safe-area-inset-top))] size-11 rounded-full flex items-center justify-center text-wa-text bg-white/10 active:bg-white/20"
            aria-label="Switch camera"
          >
            <SwitchCamera size={22} />
          </button>
        ) : null}
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

      {/* Bottom panel: same dark rounded sheet with labelled round buttons as 1-to-1 calls */}
      <div className="shrink-0 bg-wa-panel rounded-t-3xl px-3 pt-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-x-6 gap-y-5 max-w-xs mx-auto justify-items-center">
          <Ctl on={!cameraOn} onClick={toggleCamera} label={cameraOn ? "Video" : "Video off"}>
            {cameraOn ? <Video size={28} /> : <VideoOff size={28} />}
          </Ctl>
          <Ctl on={isMuted} onClick={toggleMute} label={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
          </Ctl>
          <Ctl
            on={isScreenSharing}
            onClick={canShare ? toggleScreenShare : () => toast("Screen sharing isn't supported on this device")}
            label={isScreenSharing ? "Stop" : "Share"}
          >
            {isScreenSharing ? <ScreenShareOff size={28} /> : <ScreenShare size={28} />}
          </Ctl>
          <Ctl onClick={() => setShowPeople(true)} label="Add">
            <UserPlus size={28} />
          </Ctl>
          <Ctl onClick={() => setShowPeople(true)} label="People">
            <Users size={28} />
          </Ctl>
          <Ctl danger onClick={leave} label="End">
            <PhoneOff size={30} />
          </Ctl>
        </div>
      </div>

      {showPeople && <ParticipantsSheet groupId={groupId} onClose={() => setShowPeople(false)} />}
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
