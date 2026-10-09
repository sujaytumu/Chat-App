import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Info, Phone, Video, X, Search, Palette, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import Avatar from "./Avatar";
import { WaBack, WaKebab, WaArchive } from "./icons/WaIcons";
import GroupCallBanner from "./GroupCallBanner";
import { useGroupCallStore } from "../store/useGroupCallStore";

const WallpaperPicker = lazy(() => import("./WallpaperPicker"));
const GroupInfoModal = lazy(() => import("./GroupInfoModal"));

const iconBtn =
  "size-11 rounded-full flex items-center justify-center text-wa-text hover:bg-white/10 active:bg-white/15 transition-colors disabled:opacity-30 disabled:hover:bg-transparent";

const menuItem = "w-full flex items-center gap-3 px-4 py-3 text-[15px] text-wa-text hover:bg-white/5 text-left";

const ChatHeader = () => {
  const { selectedChat, setSelectedChat, typingUsers, setChatArchived, setChatSearchOpen, setUserBlocked } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const { startCall, callStatus } = useCallStore();
  const groupCallStatus = useGroupCallStore((st) => st.status);
  const groupCallState = useGroupCallStore((st) => (selectedChat?.type === "group" ? st.states[selectedChat.data._id] : null));
  const startGroupCall = useGroupCallStore((st) => st.startCall);
  const joinGroupCall = useGroupCallStore((st) => st.joinCall);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
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

  const callBusy = callStatus !== "idle" || groupCallStatus !== "idle";
  const placeGroupCall = (type) =>
    groupCallState?.active
      ? joinGroupCall(data._id, { name: data.name, groupPic: data.groupPic })
      : startGroupCall(data, type);

  return (
    <>
    <div className="relative z-20 flex items-center gap-1 pl-1 pr-1 lg:pl-3 py-2 bg-wa-bg lg:bg-wa-panel border-b border-white/5">
      {/* Back to the chat list (phone) */}
      <button onClick={() => setSelectedChat(null)} className={`${iconBtn} lg:hidden shrink-0`} aria-label="Back">
        <WaBack size={24} />
      </button>

      <button
        className="flex items-center gap-3 text-left disabled:cursor-default min-w-0 flex-1 rounded-lg py-0.5"
        onClick={() => isGroup && setShowGroupInfo(true)}
        disabled={!isGroup}
      >
        <Avatar src={isGroup ? data.groupPic : data.profilePic} name={name} isGroup={isGroup} size="size-11" textSize="text-xl" />
        <div className="min-w-0">
          <h3 className="text-[19px] leading-6 font-medium text-wa-text truncate">{name}</h3>
          <p className={`text-[13px] leading-4 truncate ${isOnline || status === "typing…" ? "text-[#25D366]" : "text-wa-muted"}`}>
            {status}
          </p>
        </div>
      </button>

      <div className="flex items-center shrink-0">
        {isGroup && (
          <>
            <button onClick={() => placeGroupCall("video")} disabled={callBusy} className={iconBtn} title="Group video call" aria-label="Group video call">
              <Video size={24} />
            </button>
            <button onClick={() => placeGroupCall("audio")} disabled={callBusy} className={iconBtn} title="Group voice call" aria-label="Group voice call">
              <Phone size={22} />
            </button>
          </>
        )}
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
            <WaKebab size={24} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-wa-pop rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
              {isGroup && (
                <button
                  className={menuItem}
                  onClick={() => {
                    setShowMenu(false);
                    setShowGroupInfo(true);
                  }}
                >
                  <Info size={18} className="text-wa-icon" /> Group info
                </button>
              )}
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setChatSearchOpen(true);
                }}
              >
                <Search size={18} className="text-wa-icon" /> Search
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setShowWallpaper(true);
                }}
              >
                <Palette size={18} className="text-wa-icon" /> Wallpaper
              </button>
              {!isGroup && (
                <button
                  className={menuItem}
                  onClick={async () => {
                    setShowMenu(false);
                    const blocked = (authUser?.blockedUsers || []).includes(data._id);
                    if (!blocked && !window.confirm(`Block ${data.fullName}? They won't be able to message or call you.`)) return;
                    if (await setUserBlocked(data._id, !blocked)) toast(blocked ? `${data.fullName} unblocked` : `${data.fullName} blocked`, { icon: "🚫" });
                  }}
                >
                  <Ban size={18} className="text-wa-icon" />
                  {(authUser?.blockedUsers || []).includes(data._id) ? "Unblock" : "Block"}
                </button>
              )}
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setChatArchived(selectedChat, !isArchived);
                  // Archiving closes the chat, like WhatsApp
                  if (!isArchived) setSelectedChat(null);
                }}
              >
                <WaArchive size={20} up={isArchived} className="text-wa-icon" />
                {isArchived ? "Unarchive chat" : "Archive chat"}
              </button>
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setSelectedChat(null);
                }}
              >
                <X size={18} className="text-wa-icon" /> Close chat
              </button>
            </div>
          )}
        </div>
      </div>

      {showWallpaper && (
        <Suspense fallback={null}>
          <WallpaperPicker scope={`${selectedChat.type}:${data._id}`} chatName={name} onClose={() => setShowWallpaper(false)} />
        </Suspense>
      )}
      {showGroupInfo && isGroup && (
        <Suspense fallback={null}>
          <GroupInfoModal group={data} onClose={() => setShowGroupInfo(false)} />
        </Suspense>
      )}
    </div>
    {isGroup && <GroupCallBanner group={data} />}
    </>
  );
};
export default ChatHeader;
