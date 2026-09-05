import { useState } from "react";
import { X, Info, UsersRound } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import GroupInfoModal from "./GroupInfoModal";

const ChatHeader = () => {
  const { selectedChat, setSelectedChat, typingUsers } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  if (!selectedChat) return null;
  const isGroup = selectedChat.type === "group";
  const data = selectedChat.data;

  const groupTypingCount = isGroup ? (typingUsers[`group:${data._id}`]?.size ?? 0) : 0;

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-3 text-left disabled:cursor-default"
          onClick={() => isGroup && setShowGroupInfo(true)}
          disabled={!isGroup}
        >
          <div className="avatar">
            <div className="size-10 rounded-full relative overflow-hidden bg-primary/10 flex items-center justify-center">
              {isGroup ? (
                data.groupPic ? (
                  <img src={data.groupPic} alt={data.name} className="object-cover w-full h-full" />
                ) : (
                  <UsersRound className="size-5 text-primary" />
                )
              ) : (
                <img src={data.profilePic || "/avatar.png"} alt={data.fullName} />
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium">{isGroup ? data.name : data.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {isGroup
                ? groupTypingCount > 0
                  ? "typing…"
                  : `${data.members.length} members`
                : onlineUsers.includes(data._id)
                ? "Online"
                : "Offline"}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {isGroup && (
            <button onClick={() => setShowGroupInfo(true)} className="btn btn-sm btn-circle btn-ghost">
              <Info size={18} />
            </button>
          )}
          <button onClick={() => setSelectedChat(null)} className="btn btn-sm btn-circle btn-ghost">
            <X size={18} />
          </button>
        </div>
      </div>

      {showGroupInfo && isGroup && (
        <GroupInfoModal group={data} onClose={() => setShowGroupInfo(false)} />
      )}
    </div>
  );
};
export default ChatHeader;
