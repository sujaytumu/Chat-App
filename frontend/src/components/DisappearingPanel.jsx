import { ArrowLeft, Check } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";

export const DISAPPEAR_LABELS = { 0: "Off", 86400: "24 hours", 604800: "7 days", 7776000: "90 days" };

const DisappearingPanel = ({ group, isAdmin, onClose }) => {
  const setDisappearing = useChatStore((s) => s.setGroupDisappearing);
  useBackToClose(true, onClose);
  const current = group.disappearAfter || 0;

  return (
    <div className="fixed inset-0 z-[96] bg-wa-bg text-wa-text flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[19px]">Disappearing messages</h3>
      </div>
      <p className="px-5 py-4 text-[14px] text-wa-muted">
        {isAdmin
          ? "New messages sent in this group will disappear after the time you choose. Messages already sent aren't affected."
          : "Only admins can change this."}
      </p>
      {Object.entries(DISAPPEAR_LABELS).map(([secs, label]) => (
        <button
          key={secs}
          disabled={!isAdmin}
          onClick={() => setDisappearing(group._id, Number(secs))}
          className="flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/5 disabled:opacity-70"
        >
          <span className="flex-1 text-[16px]">{label}</span>
          {current === Number(secs) && <Check size={20} className="text-[#00A884]" />}
        </button>
      ))}
    </div>
  );
};

export default DisappearingPanel;
