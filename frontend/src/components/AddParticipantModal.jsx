import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Search, Check, X, UserPlus } from "lucide-react";
import Avatar from "./Avatar";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";

// "Add participant" during a call: a full-screen contact picker. Back arrow (and the phone's Back button) on the
// left, selected people as chips, and a big forward button at the bottom to bring them in.
const AddParticipantModal = ({ excludeIds = [], max = 8, onAdd, onClose }) => {
  const users = useChatStore((s) => s.users);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");
  useBackToClose(true, onClose);

  const all = useMemo(() => {
    const skip = new Set(excludeIds.map(String));
    return users.filter((u) => !u.isGroup && u._id && !skip.has(String(u._id)));
  }, [users, excludeIds]);

  const { online, others } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = all.filter((u) => (u.fullName || "").toLowerCase().includes(t)).sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
    return { online: list.filter((u) => onlineUsers.includes(u._id)), others: list.filter((u) => !onlineUsers.includes(u._id)) };
  }, [all, q, onlineUsers]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));
  const pickedUsers = picked.map((id) => all.find((u) => u._id === id)).filter(Boolean);

  const Row = ({ u }) => {
    const on = picked.includes(u._id);
    const isOn = onlineUsers.includes(u._id);
    return (
      <button onClick={() => toggle(u._id)} className={`w-full flex items-center gap-3.5 px-5 py-2.5 text-left active:bg-white/5 ${on ? "bg-[#21C063]/10" : ""}`}>
        <span className="relative">
          <Avatar src={u.profilePic} name={u.fullName} size="size-12" textSize="text-lg" />
          {isOn && <span className="absolute bottom-0 right-0 size-3.5 rounded-full bg-[#25D366] border-2 border-wa-bg" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[16.5px] text-wa-text">{u.fullName}</span>
          <span className="block text-[12.5px] text-wa-muted">{isOn ? "Online" : "Offline"}</span>
        </span>
        <span className={`size-7 rounded-full border-2 flex items-center justify-center transition-colors ${on ? "bg-[#21C063] border-[#21C063] text-black" : "border-white/25"}`}>{on && <Check size={17} strokeWidth={3.2} />}</span>
      </button>
    );
  };
  const Head = ({ children }) => <p className="px-5 pt-4 pb-1 text-[12.5px] font-medium tracking-wide text-[#21C063] uppercase">{children}</p>;

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[220] bg-wa-bg text-wa-text flex flex-col">
      <header className="shrink-0 pt-[env(safe-area-inset-top)] bg-gradient-to-b from-[#0e2a1f] to-wa-bg">
        <div className="flex items-center h-16 px-2">
          <button onClick={onClose} className="size-12 rounded-full flex items-center justify-center active:bg-white/10" aria-label="Back">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 pl-2 min-w-0">
            <h2 className="text-[20px] font-medium leading-tight">Add participant</h2>
            <p className="text-[12.5px] text-wa-muted">{picked.length ? `${picked.length} of ${max} selected` : `Pick up to ${max} people to call`}</p>
          </div>
          <UserPlus size={22} className="text-[#21C063] mr-3" />
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 h-12 rounded-full bg-wa-surface px-4">
            <Search size={19} className="text-wa-muted shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" className="flex-1 min-w-0 bg-transparent text-[16px] placeholder:text-wa-muted focus:outline-none" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-wa-muted">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        {pickedUsers.length > 0 && (
          <div className="flex gap-3 px-4 pb-3 overflow-x-auto no-scrollbar">
            {pickedUsers.map((u) => (
              <button key={u._id} onClick={() => toggle(u._id)} className="relative shrink-0 flex flex-col items-center w-14" aria-label={`Remove ${u.fullName}`}>
                <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
                <span className="absolute -top-0.5 right-0.5 size-5 rounded-full bg-wa-field flex items-center justify-center border border-black/30">
                  <X size={11} />
                </span>
                <span className="mt-1 text-[11.5px] text-wa-text2 truncate w-full text-center">{(u.fullName || "").split(" ")[0]}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(110px+env(safe-area-inset-bottom))]">
        {online.length === 0 && others.length === 0 && <p className="text-center text-wa-muted py-12 text-[15px]">No contacts found</p>}
        {online.length > 0 && <Head>Online now</Head>}
        {online.map((u) => (
          <Row key={u._id} u={u} />
        ))}
        {others.length > 0 && <Head>{online.length ? "Other contacts" : "Contacts"}</Head>}
        {others.map((u) => (
          <Row key={u._id} u={u} />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))] bg-gradient-to-t from-wa-bg via-wa-bg/95 to-transparent">
        <button onClick={onClose} className="h-12 px-6 rounded-full bg-wa-field text-[15px] font-medium active:scale-95 transition-transform">
          Back
        </button>
        <button
          onClick={() => onAdd(picked)}
          disabled={!picked.length}
          className="h-12 pl-6 pr-5 rounded-full bg-[#25D366] text-black text-[15.5px] font-semibold flex items-center gap-2 disabled:opacity-40 active:scale-95 transition-transform shadow-lg"
        >
          {picked.length ? `Add ${picked.length}` : "Add"} <ArrowRight size={20} />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default AddParticipantModal;
