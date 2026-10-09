import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Pencil, Camera, Lock } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import CreateStatusModal from "../components/CreateStatusModal";
import StatusViewer from "../components/StatusViewer";
import { useScrollMemory } from "../lib/useScrollMemory";

// "Today, 09:16" / "Yesterday, 21:40" like WhatsApp
const statusTime = (iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return `${days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${t}`;
};

const StatusPage = () => {
  const scrollRef = useScrollMemory("updates");
  const { authUser } = useAuthStore();
  const [feed, setFeed] = useState({ myStatuses: [], others: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false); // false | "text" | "image"
  const [viewing, setViewing] = useState(null); // { user, statuses, isOwn }

  const loadFeed = useCallback(() => {
    setIsLoading(true);
    axiosInstance
      .get("/status")
      .then((res) => setFeed(res.data))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  return (
    <div className="relative flex-1 flex flex-col bg-wa-bg overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-[24px] leading-none font-bold tracking-tight text-wa-text">Updates</h1>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-[#25D366]" size={28} />
          </div>
        ) : (
          <>
            <button
              onClick={() =>
                feed.myStatuses.length > 0
                  ? setViewing({ user: authUser, statuses: feed.myStatuses, isOwn: true })
                  : setShowCreate("text")
              }
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 active:bg-wa-surface"
            >
              <div className="relative">
                <img
                  src={authUser.profilePic || "/avatar.png"}
                  alt="My status"
                  className={`size-14 rounded-full object-cover ${
                    feed.myStatuses.length > 0 ? "ring-2 ring-[#00A884] ring-offset-2 ring-offset-wa-bg" : ""
                  }`}
                />
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreate("text");
                  }}
                  className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-[#00A884] border-2 border-wa-bg flex items-center justify-center text-white"
                >
                  <Plus size={14} strokeWidth={3} />
                </span>
              </div>
              <div className="text-left min-w-0">
                <p className="text-[14.5px] text-wa-text">My status</p>
                <p className="text-[12px] text-wa-muted">
                  {feed.myStatuses.length > 0
                    ? statusTime(feed.myStatuses[feed.myStatuses.length - 1].createdAt)
                    : "Tap to add status update"}
                </p>
              </div>
            </button>

            {[
              ["Recent updates", feed.others.filter((o) => o.hasUnseen)],
              ["Viewed updates", feed.others.filter((o) => !o.hasUnseen)],
            ].map(
              ([title, list]) =>
                list.length > 0 && (
                  <div key={title}>
                    <p className="px-4 pt-4 pb-1 text-[12px] font-medium text-wa-muted">{title}</p>
                    {list.map(({ user, statuses, hasUnseen }) => (
                      <button
                        key={user._id}
                        onClick={() => setViewing({ user, statuses, isOwn: false })}
                        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 active:bg-wa-surface"
                      >
                        <img
                          src={user.profilePic || "/avatar.png"}
                          alt={user.fullName}
                          className={`size-14 rounded-full object-cover ring-2 ${
                            hasUnseen ? "ring-[#00A884]" : "ring-wa-muted/40"
                          } ring-offset-2 ring-offset-wa-bg`}
                        />
                        <div className="text-left min-w-0">
                          <p className="text-[14.5px] text-wa-text truncate">{user.fullName}</p>
                          <p className="text-[12px] text-wa-muted">{statusTime(statuses[statuses.length - 1].createdAt)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
            )}

            {feed.others.length === 0 && feed.myStatuses.length === 0 && (
              <p className="text-center text-wa-muted py-10 text-sm">No status updates yet</p>
            )}

            <p className="flex items-center justify-center gap-1.5 px-6 py-6 text-[11.5px] text-wa-muted text-center border-t border-white/10 mt-4">
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
          className="size-12 rounded-2xl bg-wa-field hover:bg-wa-surface text-wa-icon shadow-lg flex items-center justify-center active:scale-95"
          aria-label="Text status"
        >
          <Pencil size={20} />
        </button>
        <button
          onClick={() => setShowCreate("image")}
          className="size-14 rounded-2xl bg-[#00A884] hover:bg-[#02906f] text-white shadow-lg flex items-center justify-center active:scale-95"
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
          onClose={() => {
            setViewing(null);
            loadFeed();
          }}
        />
      )}
    </div>
  );
};

export default StatusPage;
