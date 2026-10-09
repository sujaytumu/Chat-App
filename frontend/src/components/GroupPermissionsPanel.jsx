import { ArrowLeft } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";

const ROWS = [
  { key: "editInfo", title: "Edit group settings", sub: "Name, icon and description" },
  { key: "sendMessages", title: "Send messages", sub: "Who can post in this group" },
  { key: "addMembers", title: "Add other members", sub: "Who can add people to the group" },
];

const GroupPermissionsPanel = ({ group, isAdmin, onClose }) => {
  const setPerm = useChatStore((s) => s.setGroupPermission);
  useBackToClose(true, onClose);
  const perms = { editInfo: "admins", addMembers: "admins", sendMessages: "all", ...(group.permissions || {}) };

  return (
    <div className="fixed inset-0 z-[96] bg-wa-bg text-wa-text flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[19px]">Group permissions</h3>
      </div>
      <p className="px-5 py-3 text-[14px] text-wa-muted">
        {isAdmin ? "Choose what members can do in this group. Admins can always do everything." : "Only admins can change these."}
      </p>
      <div className="flex-1 overflow-y-auto">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/5">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px]">{r.title}</span>
              <span className="block text-[13.5px] text-wa-muted">{r.sub}</span>
            </span>
            <select
              disabled={!isAdmin}
              value={perms[r.key]}
              onChange={(e) => setPerm(group._id, r.key, e.target.value)}
              className="bg-wa-field text-wa-text rounded-lg px-3 py-2 text-[14.5px] disabled:opacity-60"
            >
              <option value="all">All members</option>
              <option value="admins">Only admins</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GroupPermissionsPanel;
