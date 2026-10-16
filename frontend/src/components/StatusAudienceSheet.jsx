import { useMemo, useState } from "react";
import { Search, Check, ArrowRight } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";
import { useBackToClose } from "../lib/useBackToClose";

// WhatsApp's "Status privacy": My contacts / My contacts except… / Only share with…
export const AUDIENCE_KEY = "status-audience";
export const readAudience = () => {
  try {
    const a = JSON.parse(localStorage.getItem(AUDIENCE_KEY) || "null");
    if (a && ["all", "except", "only"].includes(a.mode)) return { mode: a.mode, users: Array.isArray(a.users) ? a.users : [] };
  } catch {
    /* private mode */
  }
  return { mode: "all", users: [] };
};
export const audienceLabel = (a) =>
  a.mode === "all" ? "Contacts" : a.mode === "except" ? `Contacts except ${a.users.length}` : `Only ${a.users.length}`;

const Radio = ({ on }) => (
  <span className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "border-[#21C063]" : "border-[#8E9AA2]"}`}>
    {on && <span className="size-2.5 rounded-full bg-[#21C063]" />}
  </span>
);

const StatusAudienceSheet = ({ value, onClose, onSave }) => {
  useBackToClose(true, onClose);
  const users = useChatStore((s) => s.users);
  const [mode, setMode] = useState(value.mode);
  const [picked, setPicked] = useState(() => new Set(value.users));
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  // Each list is remembered separately, like WhatsApp
  const list = useMemo(() => users.filter((u) => u.fullName?.toLowerCase().includes(q.trim().toLowerCase())), [users, q]);

  const choose = (m) => {
    setMode(m);
    if (m === "all") onSave({ mode: "all", users: [] });
    else setPicking(true);
  };
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const done = () => {
    if (mode === "only" && picked.size === 0) return;
    onSave({ mode, users: [...picked] });
  };

  if (picking) {
    return (
      <div className="absolute inset-0 z-[70] bg-[#0B141A] flex flex-col text-white">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[18px]">{mode === "except" ? "Hide status from…" : "Share status with…"}</p>
          <p className="text-[12.5px] text-[#8E9AA2]">{picked.size} selected</p>
        </div>
        <div className="mx-3.5 mb-2 flex items-center gap-3 h-[42px] rounded-full bg-[#171C20] px-4">
          <Search size={18} className="text-[#8E9AA2]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="flex-1 bg-transparent text-[15px] placeholder:text-[#8E9AA2] focus:outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((u) => (
            <button key={u._id} onClick={() => toggle(u._id)} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-white/5">
              <span className="relative">
                <Avatar src={u.profilePic} name={u.fullName} size="size-11" textSize="text-lg" />
                {picked.has(u._id) && (
                  <span className="absolute -right-0.5 -bottom-0.5 size-5 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center border-2 border-[#0B141A]">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="text-[16px] truncate">{u.fullName}</span>
            </button>
          ))}
          {list.length === 0 && <p className="text-center text-[#8E9AA2] text-[13px] pt-10">No contacts found</p>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-[#0A0E11]">
          <button onClick={() => (picking && mode ? setPicking(false) : onClose())} className="text-[#8E9AA2] text-[14px]">
            Back
          </button>
          <button
            onClick={done}
            disabled={mode === "only" && picked.size === 0}
            aria-label="Done"
            className="size-12 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center disabled:opacity-50 active:scale-95"
          >
            <ArrowRight size={22} />
          </button>
        </div>
      </div>
    );
  }

  const rows = [
    ["all", "My contacts"],
    ["except", "My contacts except…"],
    ["only", "Only share with…"],
  ];
  return (
    <div className="absolute inset-0 z-[70] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-t-[22px] bg-[#1D1F1F] text-white pb-[calc(12px+env(safe-area-inset-bottom))]">
        <p className="px-5 pt-5 pb-1 text-[18px]">Status privacy</p>
        <p className="px-5 pb-2 text-[12.5px] text-[#8E9AA2]">Who can see my status updates</p>
        {rows.map(([m, label]) => (
          <button key={m} onClick={() => choose(m)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-white/5">
            <Radio on={value.mode === m} />
            <span className="flex-1 text-[16px]">{label}</span>
            {m !== "all" && value.mode === m && <span className="text-[12.5px] text-[#8E9AA2]">{value.users.length} selected</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default StatusAudienceSheet;
