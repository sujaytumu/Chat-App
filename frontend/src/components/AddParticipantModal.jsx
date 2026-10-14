import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Avatar from "./Avatar";
import { WaBack, WaCheck } from "./icons/WaIcons";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

// "Add participant" while on a 1:1 call: pick who to bring in (the call then
// becomes a group call, up to `max` extra people).
const AddParticipantModal = ({ excludeIds = [], max = 8, onAdd, onClose }) => {
  const users = useChatStore((s) => s.users);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const skip = new Set(excludeIds.map(String));
    return users
      .filter((u) => !u.isGroup && u._id && !skip.has(String(u._id)) && (u.fullName || "").toLowerCase().includes(t))
      .sort((a, b) => Number(onlineUsers.includes(b._id)) - Number(onlineUsers.includes(a._id)));
  }, [users, q, excludeIds, onlineUsers]);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));

  return (
    <div className="wa-dark fixed inset-0 z-[220] bg-black/60 flex items-stretch lg:items-center justify-center lg:p-4" onClick={onClose}>
      <div
        className="bg-wa-bg w-full lg:max-w-md lg:rounded-2xl lg:max-h-[80vh] flex flex-col overflow-hidden shadow-2xl pt-[env(safe-area-inset-top)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center h-14 pl-1 pr-3 shrink-0">
          <button onClick={onClose} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Back">
            <WaBack size={24} />
          </button>
          <div className="flex-1 pl-3 min-w-0">
            <h2 className="text-[19px] text-wa-text leading-tight">Add participant</h2>
            <p className="text-[12.5px] text-wa-muted">
              {picked.length} of {max} selected
            </p>
          </div>
          <button
            onClick={() => onAdd(picked)}
            disabled={!picked.length}
            className="h-9 px-4 rounded-full bg-[#21C063] text-wa-bg text-[15px] font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-3 h-11 rounded-full bg-wa-surface px-4">
            <Search size={18} className="text-wa-muted shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contacts"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-3">
          {shown.length === 0 && <p className="text-center text-wa-muted py-8 text-[15px]">No contacts found</p>}
          {shown.map((u) => {
            const on = picked.includes(u._id);
            return (
              <button key={u._id} onClick={() => toggle(u._id)} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-wa-surface hover:bg-wa-surface/70">
                <Avatar src={u.profilePic} name={u.fullName} size="size-11" textSize="text-base" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[16px] text-wa-text">{u.fullName}</span>
                  <span className="block text-[12.5px] text-wa-muted">{onlineUsers.includes(u._id) ? "Online" : "Offline"}</span>
                </span>
                <span className={`size-6 rounded-full border-2 flex items-center justify-center ${on ? "bg-[#21C063] border-[#21C063] text-wa-bg" : "border-wa-muted2"}`}>
                  {on && <WaCheck size={16} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AddParticipantModal;
