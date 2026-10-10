import { useMemo, useState } from "react";
import { X, Search as SearchIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "./Avatar";

// "Contact" in the attach menu: pick someone to share as a contact card.
const ContactPicker = ({ onClose, onPick }) => {
  const users = useChatStore((s) => s.users);
  const [q, setQ] = useState("");
  useBackToClose(true, onClose);
  const list = useMemo(() => users.filter((u) => u.fullName?.toLowerCase().includes(q.trim().toLowerCase())), [users, q]);
  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[80dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close">
            <X size={22} />
          </button>
          <h3 className="text-[17px] text-wa-text">Share contact</h3>
        </div>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 h-11 rounded-full bg-wa-field px-4">
            <SearchIcon size={18} className="text-wa-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent outline-none text-[15px] text-wa-text placeholder:text-wa-muted" />
          </div>
        </div>
        <div className="overflow-y-auto pb-4">
          {list.length === 0 && <p className="text-center text-wa-muted py-8 text-[14px]">No contacts found</p>}
          {list.map((u) => (
            <button key={u._id} onClick={() => onPick(u)} className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-wa-hover hover:bg-wa-hover">
              <Avatar src={u.profilePic} name={u.fullName} size="size-11" textSize="text-lg" />
              <span className="text-[16px] text-wa-text truncate">{u.fullName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContactPicker;
