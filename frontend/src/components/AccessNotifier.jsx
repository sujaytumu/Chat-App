import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";
import { closeAccessPopup, closeAllAccessPopups, hasAccessPopup, openAccessPopupIds, rememberAccessPopup } from "../lib/accessPopups";
import Avatar from "./Avatar";

// Popups for "Who can see whom":
//  - owner: "<name> is requesting to see more people" — stays until answered; Review opens that person's page
//  - person: "<owner> approved you to see <names>" (or declined)
// The owner's popups are re-synced from the server every time the app opens or reconnects, so a request that
// arrived while the app was closed, asleep or reconnecting is never missed.
const AccessNotifier = () => {
  const socket = useAuthStore((s) => s.socket);
  const navigate = useNavigate();
  const location = useLocation();
  const onAccessPage = location.pathname.startsWith("/settings/access");
  const onAccessPageRef = useRef(onAccessPage);
  onAccessPageRef.current = onAccessPage;

  // Opening "Who can see whom" shows the waiting people in the list itself: the popups have done their job.
  useEffect(() => {
    if (onAccessPage) closeAllAccessPopups();
  }, [onAccessPage]);

  useEffect(() => {
    if (!socket) return undefined;
    let isOwner = false;

    const show = ({ userId, fullName, profilePic, note }) => {
      if (!userId || hasAccessPopup(userId) || onAccessPageRef.current) return;
      const id = `access-${userId}`;
      rememberAccessPopup(userId, id);
      toast.custom(
        (t) => (
          <div className={`${t.visible ? "animate-enter" : "opacity-0"} w-[min(92vw,380px)] rounded-2xl bg-wa-pop text-wa-text px-3.5 py-3 shadow-xl border border-white/10`}>
            <div className="flex items-center gap-3">
              <Avatar src={profilePic} name={fullName} size="size-11" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium truncate">{fullName || "Someone"}</span>
                <span className="block text-[12.5px] text-wa-muted leading-snug">is requesting to see more people</span>
              </span>
              <button type="button" aria-label="Later" onClick={() => { toast.dismiss(t.id); closeAccessPopup(userId); }} className="size-8 shrink-0 flex items-center justify-center rounded-full text-wa-muted">
                <X size={18} />
              </button>
            </div>
            {note ? <p className="mt-2 text-[12.5px] bg-white/5 rounded-xl px-3 py-1.5 break-words">“{note}”</p> : null}
            <button
              type="button"
              onClick={() => {
                closeAccessPopup(userId);
                navigate(`/settings/access?user=${userId}`);
              }}
              className="mt-2.5 w-full h-9 rounded-full bg-[#25D366] text-[#0B141A] text-[13.5px] font-semibold active:scale-[0.99]"
            >
              Review request
            </button>
          </div>
        ),
        { duration: Infinity, id }
      );
    };

    // Ask the server who is still waiting: show the missing popups, drop the ones already answered.
    const sync = async () => {
      try {
        const { data: mine } = await axiosInstance.get("/access/mine");
        isOwner = !!mine?.owner;
        if (!isOwner) return;
        const { data } = await axiosInstance.get("/admin/requests");
        const waiting = new Set(data.map((r) => String(r.user._id)));
        openAccessPopupIds().forEach((uid) => !waiting.has(uid) && closeAccessPopup(uid));
        data.forEach((r) => show({ userId: String(r.user._id), fullName: r.user.fullName, profilePic: r.user.profilePic, note: r.note }));
      } catch {
        /* not reachable right now — the next reconnect tries again */
      }
    };

    const onRequest = (p) => show(p);
    const onResolved = ({ userId }) => closeAccessPopup(userId);
    const onDecision = ({ status, people, by }) => {
      if (status !== "approved") return toast("Your request to see more people was declined", { icon: "❌" });
      const list = (people || []).length ? people.slice(0, 5).join(", ") + (people.length > 5 ? ` and ${people.length - 5} more` : "") : "";
      toast.success(list ? `${by || "The owner"} approved you to see ${list}` : `${by || "The owner"} approved your request`, { duration: 7000 });
    };
    const onVisible = () => document.visibilityState === "visible" && sync();

    socket.on("accessRequest", onRequest);
    socket.on("accessRequestResolved", onResolved);
    socket.on("accessDecision", onDecision);
    socket.on("connect", sync);
    document.addEventListener("visibilitychange", onVisible);
    if (socket.connected) sync();
    return () => {
      socket.off("accessRequest", onRequest);
      socket.off("accessRequestResolved", onResolved);
      socket.off("accessDecision", onDecision);
      socket.off("connect", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [socket, navigate]);
  return null;
};

export default AccessNotifier;
