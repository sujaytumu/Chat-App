import { useEffect, useMemo, useState } from "react";
import { optimizeImage } from "../lib/cdn";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Phone, Video, Loader2, ArrowUpRight, ArrowDownLeft, CalendarDays, Grid3x3, Heart, X, PhoneCall } from "lucide-react";
import { Search, MoreVertical, ArrowLeft } from "../components/icons/WaGlyphs";
import { useBackToClose } from "../lib/useBackToClose";
import { useScrollMemory } from "../lib/useScrollMemory";

const pad = (n) => String(n).padStart(2, "0");
const formatCallTime = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) return `Today, ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return `Yesterday, ${hm}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${hm}`;
};

const QuickAction = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-2 w-[72px] shrink-0">
    <span className="size-14 rounded-full bg-wa-tint text-wa-tinttext flex items-center justify-center">{icon}</span>
    <span className="text-[11px] text-wa-text2 truncate max-w-full">{label}</span>
  </button>
);

const CallsPage = () => {
  const scrollRef = useScrollMemory("calls");
  const { authUser } = useAuthStore();
  const { startCall } = useCallStore();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useBackToClose(menuOpen, () => setMenuOpen(false));
  const [picker, setPicker] = useState(false);
  useBackToClose(picker, () => setPicker(false));
  const users = useChatStore((s) => s.users);
  const getUsers = useChatStore((s) => s.getUsers);
  useEffect(() => {
    if (!users.length) getUsers();
  }, []); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/calls")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        // A call log can reference a user that no longer exists (populate gives
        // null) — rendering such an entry used to throw and blank the whole app.
        setCalls(list.filter((c) => c && c.callerId && c.calleeId));
      })
      .catch(() => {
        if (!cancelled) setCalls([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCallBack = (otherUser, callType) => {
    navigate("/");
    setTimeout(() => startCall(otherUser, callType), 150);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? calls.filter((c) => (c.callerId._id === authUser?._id ? c.calleeId : c.callerId).fullName?.toLowerCase().includes(q)) : calls;
  }, [calls, query, authUser]);

  const pickable = useMemo(() => users.filter((u) => !u.isGroup && u._id), [users]);
  const soon = (what) => toast(`${what} isn't available yet`);

  return (
    <div className="flex-1 flex flex-col bg-wa-bg overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0 relative">
      {searching ? (
        <div className="flex items-center gap-2 px-2 pt-3 pb-2">
          <button onClick={() => { setSearching(false); setQuery(""); }} className="size-10 flex items-center justify-center text-wa-icon">
            <ArrowLeft size={22} />
          </button>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none text-[14.5px] text-wa-text placeholder:text-wa-muted"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="text-[24px] leading-none font-bold tracking-tight text-wa-text">Calls</h1>
          <div className="flex items-center gap-1 relative">
            <button onClick={() => setSearching(true)} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Search">
              <Search size={24} />
            </button>
            <button onClick={() => setMenuOpen((v) => !v)} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Menu">
              <MoreVertical size={24} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-40 min-w-[180px] rounded-xl bg-wa-pop shadow-xl py-2">
                  <button onClick={() => navigate("/settings/privacy")} className="w-full text-left px-5 py-2.5 text-[13px] text-wa-text hover:bg-wa-hover">
                    Settings
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!searching && (
          <div className="flex items-start gap-3 px-4 pt-3 pb-4 overflow-x-auto">
            <QuickAction icon={<Phone size={24} />} label="Call" onClick={() => setPicker(true)} />
            <QuickAction icon={<CalendarDays size={24} />} label="Schedule" onClick={() => soon("Scheduling calls")} />
            <QuickAction icon={<Grid3x3 size={24} />} label="Keypad" onClick={() => soon("The keypad")} />
            <QuickAction icon={<Heart size={24} />} label="Favourite" onClick={() => soon("Favourites")} />
          </div>
        )}

        <h2 className="px-4 pb-2 text-[13.5px] font-semibold text-wa-text">Recent</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-[#25D366]" size={28} />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-center text-wa-muted py-10 text-sm">{query ? "No results" : "No calls yet"}</p>
        ) : (
          shown.map((call) => {
            const isOutgoing = call.callerId._id === authUser?._id;
            const otherUser = isOutgoing ? call.calleeId : call.callerId;
            const isMissed = call.status === "missed" || call.status === "declined";
            const dir = isOutgoing ? <ArrowUpRight size={16} className="text-[#25D366]" /> : <ArrowDownLeft size={16} className={isMissed ? "text-red-500" : "text-[#25D366]"} />;

            return (
              <button
                key={call._id}
                onClick={() => handleCallBack(otherUser, call.callType)}
                className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-wa-hover active:bg-wa-surface transition-colors"
              >
                <img src={optimizeImage(otherUser.profilePic || "/avatar.png", 120)} loading="lazy" decoding="async" alt={otherUser.fullName} className="size-12 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-[14.5px] truncate ${isMissed && !isOutgoing ? "text-red-500" : "text-wa-text"}`}>{otherUser.fullName}</p>
                  <div className="flex items-center gap-1 text-[12px] text-wa-muted">
                    {dir}
                    <span>{formatCallTime(call.createdAt)}</span>
                  </div>
                </div>
                <div className="text-wa-icon shrink-0 size-10 flex items-center justify-center">
                  {call.callType === "video" ? <Video size={22} /> : <Phone size={22} />}
                </div>
              </button>
            );
          })
        )}
        <div className="h-24" />
      </div>

      <button
        onClick={() => setPicker(true)}
        className="absolute right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] lg:bottom-6 size-14 rounded-2xl bg-[#25D366] text-black shadow-lg flex items-center justify-center active:scale-95 transition"
        aria-label="New call"
      >
        <PhoneCall size={26} />
      </button>

      {picker && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setPicker(false)}>
          <div className="w-full sm:max-w-sm max-h-[75vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[15.5px] font-semibold text-wa-text">New call</h3>
              <button onClick={() => setPicker(false)} className="size-9 flex items-center justify-center text-wa-icon"><X size={22} /></button>
            </div>
            <div className="overflow-y-auto pb-4">
              {pickable.length === 0 && <p className="text-center text-wa-muted py-8 text-sm">No contacts yet</p>}
              {pickable.map((u) => (
                <div key={u._id} className="flex items-center gap-3 px-5 py-2.5">
                  <img src={optimizeImage(u.profilePic || "/avatar.png", 120)} loading="lazy" decoding="async" alt="" className="size-11 rounded-full object-cover" />
                  <span className="flex-1 min-w-0 truncate text-[13.5px] text-wa-text">{u.fullName}</span>
                  <button onClick={() => { setPicker(false); handleCallBack(u, "audio"); }} className="size-10 flex items-center justify-center text-wa-icon"><Phone size={21} /></button>
                  <button onClick={() => { setPicker(false); handleCallBack(u, "video"); }} className="size-10 flex items-center justify-center text-wa-icon"><Video size={21} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallsPage;
