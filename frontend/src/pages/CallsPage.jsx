import { useEffect, useState } from "react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneMissed, PhoneOutgoing, PhoneIncoming, Video, Loader2 } from "lucide-react";

const formatCallTime = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const CallsPage = () => {
  const { authUser } = useAuthStore();
  const { startCall } = useCallStore();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    axiosInstance
      .get("/calls")
      .then((res) => setCalls(res.data))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCallBack = (otherUser, callType) => {
    navigate("/");
    setTimeout(() => startCall(otherUser, callType), 150);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0B141A] overflow-hidden pb-16 lg:pb-0">
      <div className="p-4 border-b border-black/30">
        <h2 className="text-lg font-semibold text-[#E9EDEF]">Calls</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-[#00A884]" size={28} />
          </div>
        ) : calls.length === 0 ? (
          <p className="text-center text-[#8696A0] py-10 text-sm">No calls yet</p>
        ) : (
          calls.map((call) => {
            const isOutgoing = call.callerId._id === authUser._id;
            const otherUser = isOutgoing ? call.calleeId : call.callerId;
            const isMissed = call.status === "missed" || call.status === "declined";

            return (
              <button
                key={call._id}
                onClick={() => handleCallBack(otherUser, call.callType)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <img
                  src={otherUser.profilePic || "/avatar.png"}
                  alt={otherUser.fullName}
                  className="size-12 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-[#E9EDEF] truncate">{otherUser.fullName}</p>
                  <div className={`flex items-center gap-1 text-sm ${isMissed ? "text-red-400" : "text-[#8696A0]"}`}>
                    {isOutgoing ? <PhoneOutgoing size={13} /> : isMissed ? <PhoneMissed size={13} /> : <PhoneIncoming size={13} />}
                    <span>{formatCallTime(call.createdAt)}</span>
                  </div>
                </div>
                <div className="text-[#00A884] shrink-0">
                  {call.callType === "video" ? <Video size={20} /> : <Phone size={20} />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CallsPage;
