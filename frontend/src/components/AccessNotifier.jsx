import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import Avatar from "./Avatar";

// Popups for "Who can see whom":
//  - owner: "<name> is requesting to see more people" — tap it to open that person's page and choose whom they may see
//  - person: "<owner> approved you to see <names>" (or declined)
const AccessNotifier = () => {
  const socket = useAuthStore((s) => s.socket);
  const navigate = useNavigate();
  useEffect(() => {
    if (!socket) return undefined;
    const onRequest = ({ userId, fullName, profilePic }) => {
      toast.custom(
        (t) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              navigate(`/settings/access?user=${userId}`);
            }}
            className={`${t.visible ? "animate-enter" : "opacity-0"} w-[min(92vw,380px)] flex items-center gap-3 rounded-2xl bg-wa-pop text-wa-text px-3.5 py-3 shadow-xl text-left border border-white/10 active:scale-[0.98] transition-transform`}
          >
            <Avatar src={profilePic} name={fullName} size="size-11" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium truncate">{fullName || "Someone"}</span>
              <span className="block text-[12.5px] text-wa-muted leading-snug">is requesting to see more people · tap to choose</span>
            </span>
          </button>
        ),
        { duration: 12000, id: `access-${userId}` }
      );
    };
    const onDecision = ({ status, people, by }) => {
      if (status !== "approved") return toast("Your request to see more people was declined", { icon: "❌" });
      const list = (people || []).length ? people.slice(0, 5).join(", ") + (people.length > 5 ? ` and ${people.length - 5} more` : "") : "";
      toast.success(list ? `${by || "The owner"} approved you to see ${list}` : `${by || "The owner"} approved your request`, { duration: 7000 });
    };
    socket.on("accessRequest", onRequest);
    socket.on("accessDecision", onDecision);
    return () => {
      socket.off("accessRequest", onRequest);
      socket.off("accessDecision", onDecision);
    };
  }, [socket, navigate]);
  return null;
};

export default AccessNotifier;
