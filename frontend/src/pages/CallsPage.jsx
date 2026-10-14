import { useEffect, useMemo, useRef, useState } from "react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import { useNavigate } from "react-router-dom";
import { Phone, Video, Loader2, ArrowUpRight, ArrowDownLeft, Search, X, Plus, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import Avatar from "../components/Avatar";
import { WaKebab, WaBack } from "../components/icons/WaIcons";

const GREEN = "#25D366";
const RED = "#F15C6D";

const hhmm = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
// "Today, 14:05" · "Yesterday, 20:52" · "6 Oct, 19:37" (with the year if it's not this year)
const formatCallTime = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return `Today, ${hhmm(d)}`;
  if (days === 1) return `Yesterday, ${hhmm(d)}`;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
  return `${date}, ${hhmm(d)}`;
};
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const fmtDuration = (s) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
};

// What the arrow means (same as WhatsApp):
//   green ↗  you called and they picked up
//   green ↙  they called and you picked up
//   red   ↙  they called and you missed / declined it
//   red   ↗  you called but there was no answer
const describe = (call, myId) => {
  const outgoing = call.callerId._id === myId;
  const answered = call.status === "answered";
  const ok = answered || (call.status === "ringing" && false);
  return {
    outgoing,
    ok,
    label: outgoing
      ? answered ? "Outgoing" : call.status === "declined" ? "Declined" : "No answer"
      : answered ? "Incoming" : call.status === "declined" ? "Declined" : "Missed",
    missedIncoming: !outgoing && !answered,
  };
};

const Arrow = ({ outgoing, ok, size = 16 }) => {
  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
  return <Icon size={size} strokeWidth={2.5} color={ok ? GREEN : RED} className="shrink-0" aria-hidden />;
};

const circleBtn = "size-14 rounded-full bg-wa-surface flex items-center justify-center text-wa-text active:bg-wa-field";

const CallsPage = () => {
  const { authUser } = useAuthStore();
  const { startCall } = useCallStore();
  const { users } = useChatStore();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [info, setInfo] = useState(null); // grouped row shown in the details sheet
  const menuRef = useRef(null);
  const myId = authUser?._id;

  const load = () =>
    axiosInstance
      .get("/calls")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        // A call log can reference a user that no longer exists (populate gives
        // null) — rendering such an entry used to throw and blank the whole app.
        setCalls(list.filter((c) => c && c.callerId && c.calleeId));
      })
      .catch(() => setCalls([]))
      .finally(() => setIsLoading(false));
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const callBack = (user, type) => {
    navigate("/");
    setTimeout(() => startCall(user, type), 150);
  };

  // Back-to-back calls with the same person, same direction/result, same day
  // collapse into one row with a count: "Kavya (3)".
  const rows = useMemo(() => {
    const out = [];
    for (const c of calls) {
      const d = describe(c, myId);
      const other = d.outgoing ? c.calleeId : c.callerId;
      const key = `${other._id}|${d.outgoing}|${c.status}|${c.callType}`;
      const last = out[out.length - 1];
      if (last && last.key === key && sameDay(last.calls[0].createdAt, c.createdAt)) last.calls.push(c);
      else out.push({ key, other, d, type: c.callType, calls: [c] });
    }
    const q = query.trim().toLowerCase();
    return q ? out.filter((r) => r.other.fullName.toLowerCase().includes(q)) : out;
  }, [calls, myId, query]);

  // Quick-call row: your Favourites first, then people you called most recently.
  const quick = useMemo(() => {
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const fav = (authUser?.chatLists || []).find((l) => l.id === "favourites")?.chats || [];
    const ids = fav.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
    for (const c of calls) {
      const o = c.callerId._id === myId ? c.calleeId._id : c.callerId._id;
      if (!ids.includes(o)) ids.push(o);
    }
    return ids.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 10);
  }, [users, authUser, calls, myId]);

  const clearLog = async () => {
    setMenu(false);
    if (!window.confirm("Clear your call log? This only removes it from your list.")) return;
    try {
      await axiosInstance.delete("/calls");
      setCalls([]);
      toast("Call log cleared");
    } catch {
      toast.error("Couldn't clear the call log");
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-wa-bg overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0 relative">
      {/* Header */}
      {searching ? (
        <div className="flex items-center gap-1 h-16 px-2 shrink-0">
          <button onClick={() => { setSearching(false); setQuery(""); }} className="size-11 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Close search">
            <WaBack size={24} />
          </button>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 min-w-0 bg-transparent text-[18px] text-wa-text placeholder:text-wa-muted focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="size-11 flex items-center justify-center text-wa-muted" aria-label="Clear">
              <X size={20} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between pl-4 pr-2 h-16 shrink-0">
          <h1 className="text-[28px] lg:text-[24px] leading-none font-normal text-wa-text">Calls</h1>
          <div className="flex items-center">
            <button onClick={() => setSearching(true)} className="size-11 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Search calls">
              <Search size={24} />
            </button>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu((v) => !v)} className="size-11 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="More options">
                <WaKebab size={24} />
              </button>
              {menu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-wa-pop rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
                  <button className="w-full px-4 py-3 text-[15px] text-wa-text text-left hover:bg-white/5" onClick={clearLog} disabled={!calls.length}>
                    Clear call log
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Quick call row */}
        {!searching && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 pt-2 pb-5">
            <div className="flex flex-col items-center gap-2 w-[76px] shrink-0">
              <button onClick={() => setPicker(true)} className={circleBtn} aria-label="Call">
                <Phone size={24} />
              </button>
              <span className="text-[13px] text-wa-muted">Call</span>
            </div>
            {quick.map((u) => (
              <button key={u._id} onClick={() => callBack(u, "audio")} className="flex flex-col items-center gap-2 w-[76px] shrink-0 active:opacity-70">
                <Avatar src={u.profilePic} name={u.fullName} size="size-14" textSize="text-xl" />
                <span className="text-[13px] text-wa-muted w-full truncate text-center">{u.fullName}</span>
              </button>
            ))}
          </div>
        )}

        {!searching && <h2 className="px-4 pb-1 text-[20px] lg:text-[18px] text-wa-text">Recent</h2>}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-[#25D366]" size={28} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-wa-muted py-10 px-6 text-[15px]">
            {query ? `No calls matching “${query}”` : "No calls yet. Tap the phone button to start one."}
          </p>
        ) : (
          rows.map((r) => {
            const first = r.calls[0];
            const red = r.d.missedIncoming;
            return (
              <div key={first._id} className="flex items-center hover:bg-wa-surface/70 active:bg-wa-surface transition-colors">
                <button onClick={() => setInfo(r)} className="flex-1 min-w-0 flex items-center gap-3 lg:gap-3.5 pl-3 py-2.5 text-left">
                  <Avatar src={r.other.profilePic} name={r.other.fullName} size="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] lg:text-[16px] leading-[22px] truncate" style={{ color: red ? RED : undefined }}>
                      <span className={red ? "" : "text-wa-text"}>{r.other.fullName}</span>
                      {r.calls.length > 1 && <span className={red ? "" : "text-wa-text"}> ({r.calls.length})</span>}
                    </p>
                    <div className="flex items-center gap-1 mt-[3px] text-[14.5px] lg:text-[14px] leading-5 text-wa-muted">
                      <Arrow outgoing={r.d.outgoing} ok={!red && r.d.ok} />
                      <span className="truncate">{formatCallTime(first.createdAt)}</span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => callBack(r.other, r.type)}
                  className="size-12 mr-2 rounded-full flex items-center justify-center text-wa-text active:bg-white/10 shrink-0"
                  aria-label={r.type === "video" ? "Video call" : "Voice call"}
                >
                  {r.type === "video" ? <Video size={24} /> : <Phone size={24} />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* New call button */}
      <button
        onClick={() => setPicker(true)}
        className="absolute bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-5 right-4 size-14 rounded-2xl bg-[#21C063] hover:bg-[#1fb85f] active:scale-95 text-wa-bg flex items-center justify-center shadow-lg shadow-black/40 transition-all"
        aria-label="New call"
        title="New call"
      >
        <span className="relative">
          <Phone size={26} fill="currentColor" strokeWidth={1.5} />
          <Plus size={13} strokeWidth={3.5} className="absolute -top-1.5 -right-2.5" />
        </span>
      </button>

      {info && <CallInfo row={info} myId={myId} onClose={() => setInfo(null)} onCall={callBack} onMessage={(u) => { navigate("/"); setTimeout(() => useChatStore.getState().setSelectedChat({ type: "direct", data: u }), 150); }} />}
      {picker && <ContactPicker users={users} onClose={() => setPicker(false)} onCall={(u, t) => { setPicker(false); callBack(u, t); }} />}
    </div>
  );
};

// Details for one row: every call in the group with its time, direction and length.
const CallInfo = ({ row, myId, onClose, onCall, onMessage }) => (
  <div className="fixed inset-0 z-[150] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="wa-dark w-full sm:max-w-sm bg-wa-panel text-wa-text rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <Avatar src={row.other.profilePic} name={row.other.fullName} size="size-14" textSize="text-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[19px] truncate">{row.other.fullName}</p>
          <p className="text-[13.5px] text-wa-muted">{row.type === "video" ? "Video call" : "Voice call"}</p>
        </div>
        <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close"><X size={22} /></button>
      </div>
      <div className="flex justify-around px-4 pb-3">
        {[
          [Phone, "Audio", () => onCall(row.other, "audio")],
          [Video, "Video", () => onCall(row.other, "video")],
          [MessageSquare, "Message", () => onMessage(row.other)],
        ].map(([Icon, label, fn]) => (
          <button key={label} onClick={() => { onClose(); fn(); }} className="flex flex-col items-center gap-1.5 active:opacity-70">
            <span className="size-12 rounded-full bg-wa-surface flex items-center justify-center"><Icon size={22} /></span>
            <span className="text-[12.5px] text-wa-muted">{label}</span>
          </button>
        ))}
      </div>
      <div className="overflow-y-auto border-t border-white/10 py-1">
        {row.calls.map((c) => {
          const d = describe(c, myId);
          return (
            <div key={c._id} className="flex items-center gap-3 px-4 py-2.5">
              <Arrow outgoing={d.outgoing} ok={d.ok} size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px]" style={{ color: d.missedIncoming ? RED : undefined }}>{d.label}</p>
                <p className="text-[13px] text-wa-muted">{formatCallTime(c.createdAt)}</p>
              </div>
              <span className="text-[13.5px] text-wa-muted">{c.status === "answered" ? fmtDuration(c.durationSeconds) : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

const ContactPicker = ({ users, onClose, onCall }) => {
  const [q, setQ] = useState("");
  const list = users.filter((u) => u.fullName.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="wa-dark fixed inset-0 z-[150] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-wa-bg text-wa-text w-full sm:max-w-md sm:rounded-2xl sm:max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 h-14 px-2 shrink-0">
          <button onClick={onClose} className="size-11 rounded-full flex items-center justify-center active:bg-white/10" aria-label="Back"><WaBack size={24} /></button>
          <h2 className="text-[20px] pl-2">Select contact</h2>
        </div>
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-3 h-11 rounded-full bg-wa-surface px-4">
            <Search size={18} className="text-wa-muted shrink-0" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="flex-1 min-w-0 bg-transparent text-[16px] placeholder:text-wa-muted focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-2">
          {list.length === 0 && <p className="text-center text-wa-muted py-8 text-[15px]">No contacts found</p>}
          {list.map((u) => (
            <div key={u._id} className="flex items-center gap-3 pl-4 pr-2 py-2">
              <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
              <span className="flex-1 min-w-0 truncate text-[17px]">{u.fullName}</span>
              <button onClick={() => onCall(u, "audio")} className="size-11 rounded-full flex items-center justify-center active:bg-white/10" aria-label={`Call ${u.fullName}`}><Phone size={22} /></button>
              <button onClick={() => onCall(u, "video")} className="size-11 rounded-full flex items-center justify-center active:bg-white/10" aria-label={`Video call ${u.fullName}`}><Video size={22} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CallsPage;
