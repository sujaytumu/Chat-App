import { useEffect, useState, useMemo } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import CreateGroupModal from "./CreateGroupModal";
import { Users, UsersRound, Plus, Search } from "lucide-react";

const truncate = (str, n) => (str && str.length > n ? str.slice(0, n) + "…" : str);

const lastMessagePreview = (lastMessage, authUserId) => {
  if (!lastMessage) return "No messages yet";
  const prefix = lastMessage.senderId === authUserId ? "You: " : "";
  if (lastMessage.image && !lastMessage.text) return `${prefix}📷 Photo`;
  return `${prefix}${truncate(lastMessage.text, 28)}`;
};

const Sidebar = () => {
  const {
    getUsers,
    getGroups,
    users,
    groups,
    selectedChat,
    setSelectedChat,
    isUsersLoading,
  } = useChatStore();

  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  useEffect(() => {
    getUsers();
    getGroups();
  }, [getUsers, getGroups]);

  const items = useMemo(() => {
    const directItems = users
      .filter((u) => !showOnlineOnly || onlineUsers.includes(u._id))
      .filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()))
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
      .filter(() => !showOnlineOnly)
      .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
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

    return [...directItems, ...groupItems].sort((a, b) => b.sortTime - a.sortTime);
  }, [users, groups, showOnlineOnly, search, onlineUsers]);

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="flex-shrink-0 border-r border-base-300 flex flex-col w-20 lg:w-80 h-full mt-0">
      {/* Header */}
      <div className="p-4 border-b border-base-300 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-6" />
            <span className="font-medium hidden lg:block">Chats</span>
          </div>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="btn btn-sm btn-circle btn-ghost hidden lg:flex"
            title="New group"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="input input-sm input-bordered w-full pl-8"
          />
        </div>

        <button
          onClick={() => setShowCreateGroup(true)}
          className="btn btn-sm btn-circle btn-ghost mx-auto lg:hidden"
          title="New group"
        >
          <Plus size={18} />
        </button>

        {/* Online filter toggle */}
        <div className="mt-1 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">
            ({Math.max(onlineUsers.length - 1, 0)} online)
          </span>
        </div>
      </div>

      {/* Chat list */}
      <div className="overflow-y-auto flex-1 py-2">
        {items.map((item) => {
          const isSelected =
            selectedChat?.type === item.type && selectedChat.data._id === item.data._id;
          return (
            <button
              key={item.key}
              onClick={() => setSelectedChat({ type: item.type, data: item.data })}
              className={`w-full p-3 flex items-center gap-3 hover:bg-base-300 transition-colors ${
                isSelected ? "bg-base-300 ring-1 ring-base-300" : ""
              }`}
            >
              <div className="relative mx-auto lg:mx-0 shrink-0">
                {item.type === "group" ? (
                  <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {item.avatar ? (
                      <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <UsersRound className="size-6 text-primary" />
                    )}
                  </div>
                ) : (
                  <img
                    src={item.avatar || "/avatar.png"}
                    alt={item.name}
                    className="size-12 object-cover rounded-full"
                  />
                )}
                {item.online && (
                  <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
                )}
                {item.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-content text-[10px] font-bold flex items-center justify-center">
                    {item.unreadCount > 9 ? "9+" : item.unreadCount}
                  </span>
                )}
              </div>

              <div className="hidden lg:block text-left min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{item.name}</span>
                  {item.lastMessage && (
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      {new Date(item.lastMessage.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div
                  className={`text-sm truncate ${
                    item.unreadCount > 0 ? "text-base-content font-medium" : "text-zinc-400"
                  }`}
                >
                  {lastMessagePreview(item.lastMessage, useAuthStore.getState().authUser?._id)}
                </div>
              </div>
            </button>
          );
        })}

        {items.length === 0 && (
          <div className="text-center text-zinc-500 py-4 px-2 text-sm">No chats found</div>
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(group) => setSelectedChat({ type: "group", data: group })}
        />
      )}
    </aside>
  );
};

export default Sidebar;
