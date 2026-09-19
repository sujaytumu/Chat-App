import { useState, lazy, Suspense } from "react";
import { X, Info, UsersRound, Phone, Video } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";

const GroupInfoModal = lazy(() => import("./GroupInfoModal"));

const iconBtn = "size-9 rounded-full flex items-center justify-center text-[#AEBAC1] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent";

const ChatHeader = () => {
  const { selectedChat, setSelectedChat, typingUsers } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { startCall, callStatus } = useCallStore();
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  if (!selectedChat) return null;
  const isGroup = selectedChat.type === "group";
  const data = selectedChat.data;

  const groupTypingCount = isGroup ? (typingUsers[`group:${data._id}`]?.size ?? 0) : 0;

  return (
    <div className="px-3 py-2.5 bg-[#202C33] border-b border-black/30">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-3 text-left disabled:cursor-default min-w-0"
          onClick={() => isGroup && setShowGroupInfo(true)}
          disabled={!isGroup}
        >
          <div className="size-10 rounded-full relative overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            {isGroup ? (
              data.groupPic ? (
                <img src={data.groupPic} alt={data.name} className="object-cover w-full h-full" />
              ) : (
                <UsersRound className="size-5 text-[#00A884]" />
              )
            ) : (
              <img src={data.profilePic || "/avatar.png"} alt={data.fullName} className="object-cover w-full h-full" />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-medium text-[#E9EDEF] truncate">{isGroup ? data.name : data.fullName}</h3>
            <p className="text-xs text-[#8696A0]">
              {isGroup
                ? groupTypingCount > 0
                  ? "typing…"
                  : `${data.members.length} members`
                : onlineUsers.includes(data._id)
                ? "online"
                : "offline"}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {!isGroup && (
            <>
              <button
                onClick={() => startCall(data, "audio")}
                disabled={callStatus !== "idle"}
                className={iconBtn}
                title="Voice call"
              >
                <Phone size={19} />
              </button>
              <button
                onClick={() => startCall(data, "video")}
                disabled={callStatus !== "idle"}
                className={iconBtn}
                title="Video call"
              >
                <Video size={20} />
              </button>
            </>          )}
          {isGroup && (
            <button onClick={() => setShowGroupInfo(true)} className={iconBtn}>
              <Info size={19} />
            </button>
          )}
          <button onClick={() => setSelectedChat(null)} className={iconBtn}>
            <X size={19} />
          </button>
        </div>
      </div>

      {showGroupInfo && isGroup && (
        <Suspense fallback={null}>
          <GroupInfoModal group={data} onClose={() => setShowGroupInfo(false)} />
        </Suspense>
      )}
    </div>
  );
};
export default ChatHeader;
