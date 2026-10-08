import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { ArrowLeft, Info, Phone, Video, MoreVertical, X, Archive, ArchiveRestore, Search } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import Avatar from "./Avatar";

const GroupInfoModal = lazy(() => import("./GroupInfoModal"));

const iconBtn =
  "size-11 rounded-full flex items-center justify-center text-[#E9EDEF] hover:bg-white/10 active:bg-white/15 transition-colors disabled:opacity-30 disabled:hover:bg-transparent";

const menuItem = "w-full flex items-center gap-3 px-4 py-3 text-[15px] text-[#E9EDEF] hover:bg-white/5 text-left";

const ChatHeader = () => {
  const { selectedChat, setSelectedChat, typingUsers, setChatArchived, setChatSearchOpen } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const { startCall, callStatus } = useCallStore();
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [showMenu]);

  if (!selectedChat) return null;
  const isGroup = selectedChat.type === "group";
  const data = selectedChat.data;

  const groupTypingCount = isGroup ? (typingUsers[`group:${data._id}`]?.size ?? 0) : 0;
  const name = isGroup ? data.name : data.fullName;
  const status = isGroup
    ? groupTypingCount > 0
      ? "typing…"
      : `${data.members.length} members`
    : onlineUsers.includes(data._id)
    ? "online"
    : "offline";
  const isOnline = !isGroup && status === "online";
  const isArchived = (authUser?.archivedChats || []).includes(`${isGroup ? "g" : "d"}:${data._id}`);

  return (
    <div className="relative z-20 flex items-center gap-1 pl-1 pr-1 lg:pl-3 py-2 bg-[#0B141A] lg:bg-[#111B21] border-b border-white/5">
      {/* Back to the chat list (phone) */}
      <button onClick={() => setSelectedChat(null)} className={`${iconBtn} lg:hidden shrink-0`} aria-label="Back">
        <ArrowLeft size={24} />
      </button>

      <button
        className="flex items-center gap-3 text-left disabled:cursor-default min-w-0 flex-1 rounded-lg py-0.5"
        onClick={() => isGroup && setShowGroupInfo(true)}
        disabled={!isGroup}
      >
        <Avatar src={isGroup ? data.groupPic : data.profilePic} name={name} isGroup={isGroup} size="size-11" textSize="text-xl" />
        <div className="min-w-0">
          <h3 className="text-[19px] leading-6 font-medium text-[#E9EDEF] truncate">{name}</h3>
          <p className={`text-[13px] leading-4 truncate ${isOnline || status === "typing…" ? "text-[#25D366]" : "text-[#8696A0]"}`}>
            {status}
          </p>
        </div>
      </button>

      <div className="flex items-center shrink-0">
        {!isGroup && (
          <>
            <button
              onClick={() => startCall(data, "video")}
              disabled={callStatus !== "idle"}
              className={iconBtn}
              title="Video call"
              aria-label="Video call"
            >
              <Video size={24} />
            </button>
            <button
              onClick={() => startCall(data, "audio")}
              disabled={callStatus !== "idle"}
              className={iconBtn}
              title="Voice call"
              aria-label="Voice call"
            >
              <Phone size={22} />
            </button>
          </>
        )}

        <div className="relative" ref={menuRef}>
          <button onClick={() => setShowMenu((s) => !s)} className={iconBtn} aria-label="More options" title="More">
            <MoreVertical size={22} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
              {isGroup && (
                <button
                  className={menuItem}
                  onClick={() => {
                    setShowMenu(false);
                    setShowGroupInfo(true);
                  }}
                >
                  <Info size={18} className="text-[#AEBAC1]" /> Group info
                </button>
              )}
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setChatSearchOpen(true);
                }}
              >
                <Search size={18} className="text-[#AEBAC1]" /> Search
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setChatArchived(selectedChat, !isArchived);
                  // Archiving closes the chat, like WhatsApp
                  if (!isArchived) setSelectedChat(null);
                }}
              >
                {isArchived ? (
                  <ArchiveRestore size={18} className="text-[#AEBAC1]" />
                ) : (
                  <Archive size={18} className="text-[#AEBAC1]" />
                )}
                {isArchived ? "Unarchive chat" : "Archive chat"}
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setSelectedChat(null);
                }}
              >
                <X size={18} className="text-[#AEBAC1]" /> Close chat
              </button>
            </div>
          )}
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
