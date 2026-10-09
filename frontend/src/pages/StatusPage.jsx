import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import CreateStatusModal from "../components/CreateStatusModal";
import StatusViewer from "../components/StatusViewer";

const StatusPage = () => {
  const { authUser } = useAuthStore();
  const [feed, setFeed] = useState({ myStatuses: [], others: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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
    <div className="flex-1 flex flex-col bg-wa-bg overflow-hidden pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-[28px] leading-none font-bold tracking-tight text-wa-text">Updates</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
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
                  : setShowCreate(true)
              }
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 active:bg-wa-surface"
            >
              <div className="relative">
                <img
                  src={authUser.profilePic || "/avatar.png"}
                  alt="My status"
                  className={`size-14 rounded-full object-cover ${
                    feed.myStatuses.length > 0 ? "ring-2 ring-[#25D366] ring-offset-2 ring-offset-wa-bg" : ""
                  }`}
                />
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreate(true);
                  }}
                  className="absolute -bottom-1 -right-1 size-5 rounded-full bg-[#25D366] flex items-center justify-center text-white"
                >
                  <Plus size={12} />
                </span>
              </div>
              <div className="text-left">
                <p className="text-[17px] text-wa-text">My status</p>
                <p className="text-xs text-wa-muted">
                  {feed.myStatuses.length > 0 ? `${feed.myStatuses.length} update(s) · tap to view` : "Tap to add status"}
                </p>
              </div>
            </button>

            {feed.others.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-xs font-medium text-wa-muted">Recent updates</p>
                {feed.others.map(({ user, statuses, hasUnseen }) => (
                  <button
                    key={user._id}
                    onClick={() => setViewing({ user, statuses, isOwn: false })}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 active:bg-wa-surface"
                  >
                    <img
                      src={user.profilePic || "/avatar.png"}
                      alt={user.fullName}
                      className={`size-14 rounded-full object-cover ${
                        hasUnseen ? "ring-2 ring-[#25D366]" : "ring-2 ring-wa-muted/40"
                      } ring-offset-2 ring-offset-wa-bg`}
                    />
                    <div className="text-left">
                      <p className="text-[17px] text-wa-text">{user.fullName}</p>
                      <p className="text-xs text-wa-muted">
                        {new Date(statuses[statuses.length - 1].createdAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            )}

            {feed.others.length === 0 && feed.myStatuses.length === 0 && (
              <p className="text-center text-wa-muted py-10 text-sm">No status updates yet</p>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateStatusModal onClose={() => setShowCreate(false)} onCreated={loadFeed} />
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
