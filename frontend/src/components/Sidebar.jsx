import { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import Avatar from "./Avatar";
import MessageTicks from "./MessageTicks";
import { formatChatListTime } from "../lib/utils";
import { UserRoundPlus, Search, Settings, LogOut, MoreVertical, X, UserRound, UsersRound } from "lucide-react";

const CreateGroupModal = lazy(() => import("./CreateGroupModal"));

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
  { id: "online", label: "Online" },
];

const lastMessagePreview = (lastMessage) => {
  if (!lastMessage) return "No messages yet";
  if (lastMessage.image && !lastMessage.text) return "📷 Photo";
  if (lastMessage.file && !lastMessage.text) return `📎 ${lastMessage.file.name || "File"}`;
  return lastMessage.text || "";
};

const menuItem =
  "w-full flex items-center gap-3 px-4 py-3 text-[15px] text-[#E9EDEF] hover:bg-white/5 text-left";

const Sidebar = () => {
  const { getUsers, getGroups, users, groups, selectedChat, setSelectedChat, isUsersLoading } = useChatStore();

  const { onlineUsers, authUser, logout } = useAuthStore();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    getUsers();
    getGroups();
  }, [getUsers, getGroups]);

  useEffect(() => {
    if (!showMenu) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showMenu]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();

    const directItems = users
      .filter((u) => u.fullName.toLowerCase().includes(q))
      .map((u) => ({
        type: "direct",
        data: u,
        key: `d-${u._id}`,
        name: u.fullName,
        avatar: u.profilePic,
        online: onlineUsers.includes(u._id),
        lastMessage: u.lastMessage,
        unreadCount: u.unreadCount || 0,
        sortTime: u.lastMessage ? new Date(u.lastMessage.createdAt).getTime() : 0,
      }));

    const groupItems = groups
      .filter((g) => g.name.toLowerCase().includes(q))
      .map((g) => ({
        type: "group",
        data: g,
        key: `g-${g._id}`,
        name: g.name,
        avatar: g.groupPic,
        online: false,
        lastMessage: g.lastMessage,
        unreadCount: g.unreadCount || 0,
        sortTime: g.lastMessage
          ? new Date(g.lastMessage.createdAt).getTime()
          : new Date(g.createdAt).getTime(),
      }));

    return [...directItems, ...groupItems]
      .filter((item) => {
        if (filter === "unread") return item.unreadCount > 0;
        if (filter === "groups") return item.type === "group";
        if (filter === "online") return item.online;
        return true;
      })
      .sort((a, b) => b.sortTime - a.sortTime);
  }, [users, groups, filter, search, onlineUsers]);

  const totalUnread = useMemo(
    () => [...users, ...groups].reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [users, groups]
  );

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="relative flex flex-col w-full lg:w-[400px] xl:w-[420px] shrink-0 h-full bg-[#0B141A] lg:border-r lg:border-white/5">
      {/* Title + menu */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#E9EDEF]">Talkies</h1>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((s) => !s)}
            className="size-11 rounded-full flex items-center justify-center text-[#E9EDEF] hover:bg-white/10 active:bg-white/15 transition-colors"
            aria-label="Menu"
          >
            <MoreVertical size={22} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#233138] rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setShowCreateGroup(true);
                }}
              >
                <UsersRound size={18} className="text-[#AEBAC1]" /> New group
              </button>
              <Link to="/profile" className={menuItem} onClick={() => setShowMenu(false)}>
                <UserRound size={18} className="text-[#AEBAC1]" /> Profile
              </Link>
              <Link to="/settings" className={menuItem} onClick={() => setShowMenu(false)}>
                <Settings size={18} className="text-[#AEBAC1]" /> Settings
              </Link>
              <button className={`${menuItem} text-red-400`} onClick={logout}>
                <LogOut size={18} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search pill */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3 h-12 rounded-full bg-[#1F2C34] px-4 focus-within:ring-2 focus-within:ring-[#25D366]/50">
          <Search size={20} className="text-[#8696A0] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-[#E9EDEF] placeholder:text-[#8696A0] focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[#8696A0] hover:text-white" aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
        {FILTERS.map(({ id, label }) => {
          const active = filter === id;
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`h-9 px-4 rounded-full text-[15px] whitespace-nowrap border transition-colors ${
                active
                  ? "bg-[#103629] border-transparent text-[#D9FDD3] font-medium"
                  : "border-[#2A3942] text-[#8696A0] hover:bg-white/5"
              }`}
            >
              {label}
              {id === "unread" && totalUnread > 0 && <span className="ml-1.5 text-[#25D366]">{totalUnread}</span>}
            </button>
          );
        })}
      </div>

      {/* Chat list */}
      <div className="overflow-y-auto flex-1 pb-24">
        {items.map((item) => {
          const isSelected = selectedChat?.type === item.type && selectedChat.data._id === item.data._id;
          const hasUnread = item.unreadCount > 0;
          const sentByMe = item.lastMessage && item.lastMessage.senderId === authUser?._id;

          return (
            <button
              key={item.key}
              onClick={() => setSelectedChat({ type: item.type, data: item.data })}
              className={`w-full px-4 py-3 flex items-center gap-4 text-left transition-colors hover:bg-[#1F2C34]/70 active:bg-[#1F2C34] ${
                isSelected ? "lg:bg-[#2A3942]" : ""
              }`}
            >
              <div className="relative shrink-0">
                <Avatar src={item.avatar} name={item.name} isGroup={item.type === "group"} size="size-14" />
                {item.online && (
                  <span className="absolute bottom-0 right-0 size-3.5 bg-[#25D366] rounded-full ring-[3px] ring-[#0B141A]" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[17px] text-[#E9EDEF] truncate">{item.name}</span>
                  {item.lastMessage && (
                    <span
                      className={`text-xs shrink-0 ${hasUnread ? "text-[#25D366] font-medium" : "text-[#8696A0]"}`}
                    >
                      {formatChatListTime(item.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 mt-0.5">
                  <span
                    className={`flex items-center gap-1 min-w-0 text-[15px] ${
                      hasUnread ? "text-[#E9EDEF]" : "text-[#8696A0]"
                    }`}
                  >
                    {sentByMe && item.type === "direct" && (
                      <span className="shrink-0 text-[#8696A0]">
                        <MessageTicks message={item.lastMessage} />
                      </span>
                    )}
                    <span className="truncate">
                      {sentByMe && item.type === "group" ? "You: " : ""}
                      {lastMessagePreview(item.lastMessage)}
                    </span>
                  </span>
                  {hasUnread && (
                    <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#25D366] text-[#0B141A] text-xs font-semibold flex items-center justify-center">
                      {item.unreadCount > 99 ? "99+" : item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {items.length === 0 && (
          <div className="text-center text-[#8696A0] py-10 px-6 text-[15px]">
            {search ? `No chats matching “${search}”` : filter === "all" ? "No chats yet" : "Nothing here"}
          </div>
        )}
      </div>

      {/* Floating action button */}
      <button
        onClick={() => setShowCreateGroup(true)}
        className="absolute bottom-5 right-5 size-14 rounded-2xl bg-[#25D366] hover:bg-[#21c05e] active:scale-95 text-[#0B141A] flex items-center justify-center shadow-lg shadow-black/40 transition-all"
        aria-label="New group"
        title="New group"
      >
        <UserRoundPlus size={24} />
      </button>

      {showCreateGroup && (
        <Suspense fallback={null}>
          <CreateGroupModal
            onClose={() => setShowCreateGroup(false)}
            onCreated={(group) => setSelectedChat({ type: "group", data: group })}
          />
        </Suspense>
      )}
    </aside>
  );
};

export default Sidebar;
