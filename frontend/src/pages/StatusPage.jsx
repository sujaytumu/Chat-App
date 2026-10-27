import { useEffect, useState, useCallback, useRef } from "react";
import { optimizeImage } from "../lib/cdn";
import { Plus, Loader2, Pencil, Camera, Lock, BellOff, Bell, Bookmark, Eye } from "lucide-react";
import { createPortal } from "react-dom";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import CreateStatusModal from "../components/CreateStatusModal";
import StatusViewer from "../components/StatusViewer";
import HighlightsRow from "../components/HighlightsRow";
import HighlightSheet from "../components/HighlightSheet";
import PlaylistsCard from "../components/PlaylistsCard";
import { HL_GRADIENT } from "../lib/highlightTheme";
import { useScrollMemory } from "../lib/useScrollMemory";
import toast from "react-hot-toast";

// "Today, 09:16" / "Yesterday, 21:40" like WhatsApp
const statusTime = (iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return `${days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${t}`;
};

// WhatsApp-style bottom sheet for one person's updates: opened by holding (or right-clicking) their row.
const StatusRowSheet = ({ entry, muted, onClose, onView, onMute }) => {
  const { user } = entry;
  const Row = ({ icon: Icon, label, onClick, danger }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-5 px-6 py-3.5 text-[15.5px] text-left hover:bg-white/5 active:bg-white/10 ${danger ? "text-[#F15C6D]" : "text-wa-text"}`}>
      <Icon size={22} className={danger ? "" : "text-wa-icon"} />
      {label}
    </button>
  );
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-2xl pb-[calc(8px+env(safe-area-inset-bottom))] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
        <div className="flex items-center gap-3 px-6 pt-4 pb-3 border-b border-white/10">
          <img src={optimizeImage(user.profilePic, 120) || "/avatar.png"} alt="" className="size-11 rounded-full object-cover" />
          <p className="text-[16px] font-medium truncate">{user.fullName}</p>
        </div>
        <div className="py-1">
          <Row icon={Eye} label="View updates" onClick={onView} />
          {muted ? (
            <Row icon={Bell} label="Unmute" onClick={() => onMute("off")} />
          ) : (
            <>
              <Row icon={BellOff} label="Mute for 8 hours" onClick={() => onMute("8h")} />
              <Row icon={BellOff} label="Mute for 1 week" onClick={() => onMute("1w")} />
              <Row icon={BellOff} label="Mute always" onClick={() => onMute("always")} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const StatusPage = () => {
  const scrollRef = useScrollMemory("updates");
  const { authUser } = useAuthStore();
  const [feed, setFeed] = useState({ myStatuses: [], others: [] });
  const [isLoading, setIsLoading] = useState(true);
  // People whose updates you muted: they move to "Muted updates" at the bottom (kept on this device).
  // "always" mutes are a list of ids; timed ones (8 hours / 1 week) are id -> end time and fade out by themselves.
  const readLS = (key, fallback) => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      return raw ?? fallback;
    } catch {
      return fallback;
    }
  };
  const writeLS = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: still works until the page closes */
    }
  };
  const [muted, setMuted] = useState(() => {
    const raw = readLS("talkies.mutedStatus", []);
    return Array.isArray(raw) ? raw : [];
  });
  const [mutedUntil, setMutedUntil] = useState(() => {
    const raw = readLS("talkies.mutedStatusUntil", {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  });
  const isMuted = (id) => muted.includes(id) || (mutedUntil[id] || 0) > Date.now();
  const setMute = (id, mode) => {
    // mode: "8h" | "1w" | "always" | "off"
    const nextAlways = mode === "always" ? [...new Set([...muted, id])] : muted.filter((x) => x !== id);
    const nextUntil = { ...mutedUntil };
    if (mode === "8h") nextUntil[id] = Date.now() + 8 * 3600 * 1000;
    else if (mode === "1w") nextUntil[id] = Date.now() + 7 * 24 * 3600 * 1000;
    else delete nextUntil[id];
    setMuted(nextAlways);
    setMutedUntil(nextUntil);
    writeLS("talkies.mutedStatus", nextAlways);
    writeLS("talkies.mutedStatusUntil", nextUntil);
  };
  // long-press (or right-click) a person's row for options
  const [rowSheet, setRowSheet] = useState(null); // { user, statuses }
  const pressTimer = useRef(null);
  const rowLongPressed = useRef(false);
  const startRowPress = (entry) => {
    rowLongPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      rowLongPressed.current = true;
      navigator.vibrate?.(15);
      setRowSheet(entry);
    }, 450);
  };
  const endRowPress = () => clearTimeout(pressTimer.current);
  const [showCreate, setShowCreate] = useState(false); // false | "text" | "image"
  const [viewing, setViewing] = useState(null); // { user, statuses, isOwn, highlight? }
  const [myHighlights, setMyHighlights] = useState([]);
  const [otherHighlights, setOtherHighlights] = useState([]); // [{ user, highlights }]
  const [highlightSheet, setHighlightSheet] = useState(null); // { preselect?, editing? }

  const loadHighlights = useCallback(() => {
    if (!authUser?._id) return;
    axiosInstance
      .get(`/highlights/user/${authUser._id}`, { params: { t: Date.now() } })
      .then((res) => setMyHighlights(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
    axiosInstance
      .get("/highlights/feed", { params: { t: Date.now() } })
      .then((res) => setOtherHighlights(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [authUser?._id]);

  const loadFeed = useCallback(() => {
    setIsLoading(true);
    axiosInstance
      .get("/status", { params: { t: Date.now() } })
      .then((res) => setFeed({ myStatuses: res.data?.myStatuses || [], others: res.data?.others || [] }))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadFeed();
    loadHighlights();
  }, [loadFeed, loadHighlights]);

  return (
    <div className="relative flex-1 flex flex-col bg-wa-bg overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <h1 className="text-[28px] leading-none font-bold tracking-tight text-wa-text">Updates</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-[#25D366]" size={28} />
          </div>
        ) : (
          <>
            {/* One slim row you swipe sideways (like WhatsApp's status bar): my status first, then everyone else's */}
            <div className="flex gap-[18px] overflow-x-auto no-scrollbar px-5 pt-2 pb-4 border-b border-white/5">
              <button
                onClick={() =>
                  feed.myStatuses.length > 0
                    ? setViewing({ user: authUser, statuses: feed.myStatuses, isOwn: true })
                    : setShowCreate("image")
                }
                className="shrink-0 w-[72px] flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <div className="relative">
                  <img
                    src={optimizeImage(authUser.profilePic, 120) || "/avatar.png"} loading="lazy" decoding="async"
                    alt="My status"
                    className={`size-[64px] rounded-full object-cover ${feed.myStatuses.length > 0 ? "ring-2 ring-[#00A884] ring-offset-2 ring-offset-wa-bg" : ""}`}
                  />
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreate("image");
                    }}
                    className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-[#00A884] border-2 border-wa-bg flex items-center justify-center text-white"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </span>
                </div>
                <span className="text-[12.5px] font-medium text-wa-text truncate w-full text-center">My status</span>
              </button>

              {[
                ...feed.others.filter((o) => o.hasUnseen && !isMuted(o.user._id)).map((o) => ({ ...o, tone: "new" })),
                ...feed.others.filter((o) => !o.hasUnseen && !isMuted(o.user._id)).map((o) => ({ ...o, tone: "seen" })),
                ...feed.others.filter((o) => isMuted(o.user._id)).map((o) => ({ ...o, tone: "muted" })),
              ].map(({ user, statuses, hasUnseen, tone }) => (
                <button
                  key={user._id}
                  onClick={() => {
                    if (rowLongPressed.current) return; // the long-press already opened the options
                    setViewing({ user, statuses, isOwn: false });
                  }}
                  onPointerDown={() => startRowPress({ user, statuses })}
                  onPointerUp={endRowPress}
                  onPointerLeave={endRowPress}
                  onPointerCancel={endRowPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRowSheet({ user, statuses });
                  }}
                  className={`shrink-0 w-[72px] flex flex-col items-center gap-2 select-none active:scale-95 transition-transform ${tone === "muted" ? "opacity-60" : ""}`}
                >
                  <img
                    src={optimizeImage(user.profilePic, 120) || "/avatar.png"} loading="lazy" decoding="async"
                    alt={user.fullName}
                    className={`size-[64px] rounded-full object-cover ring-2 ${hasUnseen && tone !== "muted" ? "ring-[#00A884]" : "ring-wa-muted/40"} ring-offset-2 ring-offset-wa-bg`}
                    draggable={false}
                  />
                  <span className={`text-[12.5px] truncate w-full text-center ${tone === "new" ? "text-wa-text font-medium" : "text-wa-muted"}`}>{(user.fullName || "").split(" ")[0]}</span>
                </button>
              ))}
            </div>

            {/* Highlights: updates kept past the 24 hours (like Instagram highlights), in their own colours */}
            <div className="mt-3 pb-1 border-t border-white/5 pt-3">
              <div className="flex items-center gap-2 px-5 pb-2">
                <span className="size-6 rounded-lg flex items-center justify-center text-white" style={{ background: HL_GRADIENT }}>
                  <Bookmark size={13} />
                </span>
                <p className="text-[15.5px] font-semibold text-wa-text">Highlights</p>
                <p className="ml-auto text-[11.5px] text-wa-muted">{myHighlights.length > 0 ? "Hold one to edit" : "Keep your best updates"}</p>
              </div>
              <HighlightsRow
                highlights={myHighlights}
                isOwn
                onNew={() => setHighlightSheet({})}
                onEdit={(h) => setHighlightSheet({ editing: h })}
                onOpen={(h) => setViewing({ user: authUser, statuses: h.items, isOwn: true, highlight: h })}
              />
              {otherHighlights.length > 0 && (
                <>
                  <p className="px-5 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wider text-wa-muted">From others</p>
                  <HighlightsRow
                    showOwner
                    highlights={otherHighlights.flatMap((g) => g.highlights.map((h) => ({ ...h, user: g.user })))}
                    onOpen={(h) => setViewing({ user: h.user, statuses: h.items, isOwn: false, highlight: h })}
                  />
                </>
              )}
            </div>

            <PlaylistsCard />

            {feed.others.length === 0 && feed.myStatuses.length === 0 && (
              <p className="text-center text-wa-muted py-10 text-sm">No status updates yet</p>
            )}

            <p className="flex items-center justify-center gap-1.5 px-6 pt-6 pb-40 text-[11.5px] text-wa-muted text-center border-t border-white/10 mt-4">
              <Lock size={13} className="shrink-0" /> Your status updates are{" "}
              <span className="text-[#00A884]">end-to-end encrypted</span>
            </p>
          </>
        )}
      </div>

      {/* Floating buttons like WhatsApp: small pencil (text status) above the green camera (photo status) */}
      <div className="absolute right-4 bottom-[calc(92px+env(safe-area-inset-bottom))] lg:bottom-6 flex flex-col items-center gap-3.5">
        <button
          onClick={() => setShowCreate("text")}
          className="size-12 rounded-2xl bg-wa-field hover:bg-wa-surface text-wa-icon shadow-lg ring-1 ring-black/5 flex items-center justify-center active:scale-95"
          aria-label="Text status"
        >
          <Pencil size={20} />
        </button>
        <button
          onClick={() => setShowCreate("image")}
          className="size-14 rounded-[20px] bg-[#00A884] hover:bg-[#02906f] text-white shadow-xl shadow-[#00A884]/30 flex items-center justify-center active:scale-95"
          aria-label="Photo status"
        >
          <Camera size={24} />
        </button>
      </div>

      {showCreate && (
        <CreateStatusModal startWith={showCreate} onClose={() => setShowCreate(false)} onCreated={loadFeed} />
      )}
      {viewing && (
        <StatusViewer
          user={viewing.user}
          statuses={viewing.statuses}
          isOwn={viewing.isOwn}
          highlight={viewing.highlight || null}
          hold={!!highlightSheet}
          onAddToHighlight={(st) => setHighlightSheet({ preselect: st._id })}
          onEditHighlight={(h) => setHighlightSheet({ editing: h })}
          onClose={() => {
            setViewing(null);
            loadFeed();
            loadHighlights();
          }}
        />
      )}
      {rowSheet && (
        <StatusRowSheet
          entry={rowSheet}
          muted={isMuted(rowSheet.user._id)}
          onClose={() => setRowSheet(null)}
          onView={() => {
            setViewing({ user: rowSheet.user, statuses: rowSheet.statuses, isOwn: false });
            setRowSheet(null);
          }}
          onMute={(mode) => {
            setMute(rowSheet.user._id, mode);
            setRowSheet(null);
            toast(mode === "off" ? `Unmuted ${rowSheet.user.fullName}` : `Muted ${rowSheet.user.fullName}`, { icon: mode === "off" ? "🔔" : "🔕" });
          }}
        />
      )}
      {highlightSheet && (
        <HighlightSheet
          statuses={feed.myStatuses}
          highlights={myHighlights}
          preselect={highlightSheet.preselect || null}
          editing={highlightSheet.editing || null}
          onClose={() => setHighlightSheet(null)}
          onSaved={() => {
            loadHighlights();
            setViewing((v) => (v?.highlight ? null : v)); // an edited highlight reopens fresh from the row
          }}
        />
      )}
    </div>
  );
};

export default StatusPage;
