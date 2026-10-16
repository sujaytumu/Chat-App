import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import { useNavigate } from "react-router-dom";
import { Phone, Video, Loader2, ArrowUpRight, ArrowDownLeft, Search, X, Plus, MessageSquare, Heart, Info, Link2, CalendarClock, Copy, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Avatar from "../components/Avatar";
import { WaKebab, WaBack } from "../components/icons/WaIcons";
import { useBackToClose } from "../lib/useBackToClose";
import { useScrollMemory } from "../lib/useScrollMemory";

const ContactInfoModal = lazy(() => import("../components/ContactInfoModal"));
const CallLinkSheet = lazy(() => import("../components/CallLinkSheet"));

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
//   (outgoing calls are never red in this app)
const fmtBytes = (b) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const describe = (call, myId) => {
  const outgoing = call.callerId._id === myId;
  const answered = call.status === "answered";
  // Outgoing calls are never red. Incoming calls are green when you picked up, red when you didn't.
  const ok = outgoing ? true : answered;
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
  const scrollRef = useScrollMemory("calls");
  const { authUser } = useAuthStore();
  const { startCall } = useCallStore();
  const users = useChatStore((s) => s.users);
  const getUsers = useChatStore((s) => s.getUsers);
  useEffect(() => {
    if (!users.length) getUsers();
  }, []); // eslint-disable-line
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [info, setInfo] = useState(null); // grouped row shown in the details sheet
  const [linkSheet, setLinkSheet] = useState(null); // null | "link" | "schedule"
  const [upcoming, setUpcoming] = useState([]);
  useBackToClose(!!linkSheet, () => setLinkSheet(null));
  const loadUpcoming = () =>
    axiosInstance
      .get("/calls/links")
      .then((r) => setUpcoming(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  useEffect(() => {
    loadUpcoming();
  }, []);
  const copyLink = async (code) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/call/${code}`);
      toast("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const removeLink = async (code) => {
    if (!window.confirm("Cancel this call link? Nobody will be able to join with it.")) return;
    try {
      await axiosInstance.delete(`/calls/links/${code}`);
      setUpcoming((l) => l.filter((x) => x.code !== code));
    } catch {
      toast.error("Couldn't cancel it");
    }
  };
  const menuRef = useRef(null);
  // Phone Back closes the open sheet / menu / search first instead of leaving the screen.
  useBackToClose(menu, () => setMenu(false));
  useBackToClose(picker, () => setPicker(false));
  useBackToClose(!!info, () => setInfo(null));
  useBackToClose(searching, () => {
    setSearching(false);
    setQuery("");
  });
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
  // Keep the list live: refresh a moment after any call ends (the server finalises the log first).
  const liveCallStatus = useCallStore((s) => s.callStatus);
  useEffect(() => {
    if (liveCallStatus !== "idle") return;
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [liveCallStatus]);

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
  const [filter, setFilter] = useState("all"); // all | missed | video
  const rows = useMemo(() => {
    const out = [];
    const shown = filter === "missed" ? calls.filter((c) => describe(c, myId).missedIncoming) : filter === "video" ? calls.filter((c) => c.callType === "video") : calls;
    for (const c of shown) {
      const d = describe(c, myId);
      const other = d.outgoing ? c.calleeId : c.callerId;
      const key = `${other._id}|${d.outgoing}|${c.status}|${c.callType}`;
      const last = out[out.length - 1];
      if (last && last.key === key && sameDay(last.calls[0].createdAt, c.createdAt)) last.calls.push(c);
      else out.push({ key, other, d, type: c.callType, calls: [c] });
    }
    const q = query.trim().toLowerCase();
    return q ? out.filter((r) => r.other.fullName.toLowerCase().includes(q)) : out;
  }, [calls, myId, query, filter]);

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

  const [favPicker, setFavPicker] = useState(false);
  useBackToClose(favPicker, () => setFavPicker(false));
  const favUsers = useMemo(() => {
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const fav = (authUser?.chatLists || []).find((l) => l.id === "favourites")?.chats || [];
    return fav.filter((k) => k.startsWith("d:")).map((k) => byId.get(k.slice(2))).filter(Boolean);
  }, [users, authUser]);

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
            className="flex-1 min-w-0 bg-transparent text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="size-11 flex items-center justify-center text-wa-muted" aria-label="Clear">
              <X size={20} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between pl-4 pr-2 h-16 shrink-0">
          <h1 className="text-[22px] lg:text-[22px] leading-none font-normal text-wa-text">Calls</h1>
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24">
        {/* Quick call row */}
        {!searching && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 pt-2 pb-5">
            <div className="flex flex-col items-center gap-2 w-[76px] shrink-0">
              <button onClick={() => setPicker(true)} className={circleBtn} aria-label="Call">
                <Phone size={24} />
              </button>
              <span className="text-[13px] text-wa-muted">Call</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-[76px] shrink-0">
              <button
                onClick={() => (favUsers.length ? setFavPicker(true) : toast("Add favourites from a chat's menu to see them here", { icon: "💚" }))}
                className={circleBtn}
                aria-label="Favourites"
              >
                <Heart size={24} />
              </button>
              <span className="text-[13px] text-wa-muted">Favourites</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-[76px] shrink-0">
              <button onClick={() => setLinkSheet("schedule")} className={circleBtn} aria-label="Schedule call">
                <CalendarClock size={24} />
              </button>
              <span className="text-[13px] text-wa-muted">Schedule</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-[76px] shrink-0">
              <button onClick={() => setLinkSheet("link")} className={circleBtn} aria-label="Call link">
                <Link2 size={24} />
              </button>
              <span className="text-[13px] text-wa-muted">Call link</span>
            </div>
            {quick.map((u) => (
              <button key={u._id} onClick={() => callBack(u, "audio")} className="flex flex-col items-center gap-2 w-[76px] shrink-0 active:opacity-70">
                <Avatar src={u.profilePic} name={u.fullName} size="size-14" textSize="text-xl" />
                <span className="text-[13px] text-wa-muted w-full truncate text-center">{u.fullName}</span>
              </button>
            ))}
          </div>
        )}

        {!searching && upcoming.length > 0 && (
          <>
            <h2 className="px-4 pb-1 text-[16px] text-wa-text">Upcoming and links</h2>
            {upcoming.map((l) => {
              const mine = l.creatorId === myId;
              return (
                <div key={l.code} className="flex items-center gap-3 px-4 py-2.5">
                  <button onClick={() => navigate(`/call/${l.code}`)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <span className="size-12 rounded-full bg-[#21C063]/15 text-[#21C063] flex items-center justify-center shrink-0">
                      {l.scheduledFor ? <CalendarClock size={22} /> : <Link2 size={22} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[16.5px] text-wa-text truncate">{l.title || (l.callType === "video" ? "Video call" : "Voice call")}</span>
                      <span className="block text-[13.5px] text-wa-muted truncate">
                        {l.live ? `${l.participants} in the call now` : l.scheduledFor ? new Date(l.scheduledFor).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Call link"}
                        {!mine && l.creatorName ? ` · ${l.creatorName}` : ""}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => copyLink(l.code)} className="size-10 rounded-full flex items-center justify-center text-wa-muted active:bg-white/10" aria-label="Copy link">
                    <Copy size={19} />
                  </button>
                  {mine && (
                    <button onClick={() => removeLink(l.code)} className="size-10 rounded-full flex items-center justify-center text-wa-muted active:bg-white/10" aria-label="Cancel">
                      <Trash2 size={19} />
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {!searching && <h2 className="px-4 pb-1 text-[16px] lg:text-[16px] text-wa-text">Recent</h2>}
        {!searching && (
          <div className="flex gap-2 px-4 pt-1 pb-2">
            {[["all", "All"], ["missed", "Missed"], ["video", "Video"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`h-8 px-4 rounded-full text-[13.5px] border transition-colors ${filter === id ? "bg-[#103629] border-transparent text-[#D9FDD3]" : "border-white/15 text-wa-muted active:bg-white/5"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

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
                      <span className="truncate">{formatCallTime(first.createdAt)}{first.status === "answered" && first.durationSeconds ? ` · ${fmtDuration(first.durationSeconds)}` : ""}</span>
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

      {linkSheet && (
        <Suspense fallback={null}>
          <CallLinkSheet schedule={linkSheet === "schedule"} onClose={() => setLinkSheet(null)} onCreated={loadUpcoming} />
        </Suspense>
      )}
      {info && <CallInfo row={info} myId={myId} onClose={() => setInfo(null)} onCall={callBack} onMessage={(u) => { navigate("/"); setTimeout(() => useChatStore.getState().setSelectedChat({ type: "direct", data: u }), 150); }} />}
      {favPicker && <ContactPicker title="Favourites" users={favUsers} onClose={() => setFavPicker(false)} onCall={(u, t) => { setFavPicker(false); callBack(u, t); }} />}
      {picker && <ContactPicker users={users} onClose={() => setPicker(false)} onCall={(u, t) => { setPicker(false); callBack(u, t); }} />}
    </div>
  );
};

// Full call info page (like WhatsApp): who, quick actions, then every call grouped by day
// with its kind, time, length and data used.
const shortDuration = (s) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
};
const dayHeading = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
};
const kindLabel = (c, d) => {
  const kind = c.callType === "video" ? "video call" : "voice call";
  if (d.outgoing) return `Outgoing ${kind}`;
  if (c.status === "answered") return `Incoming ${kind}`;
  return `${c.status === "declined" ? "Declined" : "Missed"} ${kind}`;
};

const CallInfo = ({ row, myId, onClose, onCall, onMessage }) => {
  const [showContact, setShowContact] = useState(false);
  const days = [];
  row.calls.forEach((c) => {
    const key = new Date(c.createdAt).toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(c);
    else days.push({ key, label: dayHeading(c.createdAt), items: [c] });
  });
  const actions = [
    [MessageSquare, "Message", () => { onClose(); onMessage(row.other); }],
    [Phone, "Voice", () => { onClose(); onCall(row.other, "audio"); }],
    [Video, "Video", () => { onClose(); onCall(row.other, "video"); }],
    [Info, "Info", () => setShowContact(true)],
  ];
  return (
    <div className="wa-dark fixed inset-0 z-[150] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] bg-wa-bg text-wa-text sm:rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 h-14 px-2 shrink-0 border-b border-white/5">
          <button onClick={onClose} className="size-11 rounded-full flex items-center justify-center active:bg-white/10" aria-label="Back"><WaBack size={24} /></button>
          <h2 className="text-[20px] pl-2">Call info</h2>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-6">
          <div className="flex flex-col items-center pt-6 px-4">
            <Avatar src={row.other.profilePic} name={row.other.fullName} size="size-[170px]" textSize="text-6xl" />
            <p className="mt-4 text-[28px] leading-tight text-center break-words max-w-full">{row.other.fullName}</p>
            {row.other.about ? <p className="mt-1 text-[15px] text-wa-muted text-center max-w-full truncate">{row.other.about}</p> : null}
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 mt-6 pb-5 border-b border-white/10">
            {actions.map(([Icon, label, fn]) => (
              <button key={label} onClick={fn} className="flex flex-col items-center gap-2 active:opacity-70">
                <span className="w-full h-14 rounded-full bg-wa-surface flex items-center justify-center"><Icon size={24} /></span>
                <span className="text-[14px]">{label}</span>
              </button>
            ))}
          </div>
          {days.map((day) => (
            <div key={day.key}>
              <p className="px-5 pt-6 pb-2 text-[15px] text-wa-muted">{day.label}</p>
              {day.items.map((c) => {
                const d = describe(c, myId);
                const answered = c.status === "answered";
                return (
                  <div key={c._id} className="flex items-center gap-5 px-5 py-2.5">
                    <Arrow outgoing={d.outgoing} ok={d.ok} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px]" style={{ color: d.missedIncoming ? RED : undefined }}>{kindLabel(c, d)}</p>
                      <p className="text-[15px] text-wa-muted">{hhmm(new Date(c.createdAt))}</p>
                    </div>
                    <div className="text-right text-[15px] text-wa-muted leading-snug">
                      {answered && c.durationSeconds ? <p>{shortDuration(c.durationSeconds)}</p> : null}
                      {answered && c.dataBytes ? <p>{fmtBytes(c.dataBytes)}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {showContact && (
        <Suspense fallback={null}>
          <ContactInfoModal user={row.other} status={row.other.about || ""} onClose={() => setShowContact(false)} />
        </Suspense>
      )}
    </div>
  );
};

const ContactPicker = ({ users, onClose, onCall, title = "Select contact" }) => {
  const [q, setQ] = useState("");
  const list = users.filter((u) => !u.isGroup && (u.fullName || "").toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="wa-dark fixed inset-0 z-[150] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-wa-bg text-wa-text w-full sm:max-w-md sm:rounded-2xl sm:max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 h-14 px-2 shrink-0">
          <button onClick={onClose} className="size-11 rounded-full flex items-center justify-center active:bg-white/10" aria-label="Back"><WaBack size={24} /></button>
          <h2 className="text-[17px] pl-2">{title}</h2>
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
