import { Phone, Video, PhoneMissed } from "lucide-react";

const formatDuration = (secs) => {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const statusLabel = (status, duration) => {
  if (status === "answered") return formatDuration(duration) || "Answered";
  if (status === "declined") return "Declined";
  return "No answer";
};

// Inline call-summary bubble, matching WhatsApp's "Voice call · No answer"
// entries that appear directly in the chat thread — one per genuine call
// attempt outcome, never speculative or repeated.
const CallLogBubble = ({ callInfo }) => {
  const Icon = callInfo.callType === "video" ? Video : Phone;
  const missed = callInfo.status !== "answered";

  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className={`size-7 rounded-full flex items-center justify-center ${missed ? "bg-red-500/15" : "bg-[#00A884]/15"}`}>
        {missed ? <PhoneMissed size={14} className="text-red-400" /> : <Icon size={14} className="text-[#00A884]" />}
      </span>
      <div>
        <p className="text-sm text-[#E9EDEF] font-medium">
          {callInfo.callType === "video" ? "Video call" : "Voice call"}
        </p>
        <p className="text-xs text-[#8696A0]">{statusLabel(callInfo.status, callInfo.durationSeconds)}</p>
      </div>
    </div>
  );
};

export default CallLogBubble;
