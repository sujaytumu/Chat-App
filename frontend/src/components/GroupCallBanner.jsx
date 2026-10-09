import { Phone, Video } from "lucide-react";
import { useGroupCallStore, MAX_GROUP_CALL } from "../store/useGroupCallStore";
import { useCallStore } from "../store/useCallStore";

// Shown under a group's header while a call is running that you haven't joined.
const GroupCallBanner = ({ group }) => {
  const st = useGroupCallStore((s) => s.states[group._id]);
  const status = useGroupCallStore((s) => s.status);
  const joinCall = useGroupCallStore((s) => s.joinCall);
  const oneToOne = useCallStore((s) => s.callStatus);

  if (!st?.active || status !== "idle") return null;
  const n = st.participants?.length || 0;
  const full = n >= MAX_GROUP_CALL;
  const Icon = st.callType === "video" ? Video : Phone;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-wa-tint border-b border-white/5">
      <span className="size-9 rounded-full bg-[#21C063] text-wa-bg flex items-center justify-center shrink-0">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-wa-text truncate">
          {st.callType === "video" ? "Video" : "Voice"} call in progress
        </p>
        <p className="text-[12.5px] text-[#8DB5A3]">{n} in call</p>
      </div>
      <button
        disabled={full || oneToOne !== "idle"}
        onClick={() => joinCall(group._id, { name: group.name, groupPic: group.groupPic })}
        className="h-9 px-5 rounded-full bg-[#21C063] text-wa-bg text-[14px] font-semibold disabled:opacity-40"
      >
        {full ? "Full" : "Join"}
      </button>
    </div>
  );
};

export default GroupCallBanner;
