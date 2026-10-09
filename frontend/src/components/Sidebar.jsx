import { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import { useBackToClose } from "../lib/useBackToClose";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import Avatar from "./Avatar";
import MessageTicks from "./MessageTicks";
import { formatChatListTime } from "../lib/utils";
import {
  Search,
  Settings,
  LogOut,
  X,
  UserRound,
  UsersRound,
} from "lucide-react";
import toast from "react-hot-toast";
import SearchSnippet from "./SearchSnippet";
import { buzz } from "../lib/uiSettings";
import ChatListModal from "./ChatListModal";
import { useScrollMemory } from "../lib/useScrollMemory";
import {
  WaBack,
  WaKebab,
  WaPinAction,
  WaUnpinAction,
  WaPinSolid,
  WaTrash,
  WaBell,
  WaBellOff,
  WaArchive,
  WaCheck,
  WaNewChat,
} from "./icons/WaIcons";

const CreateGroupModal = lazy(() => import("./CreateGroupModal"));

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "fav", label: "Favourites" },
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
  "w-full flex items-center gap-3 px-4 py-3 text-[13px] text-wa-text hover:bg-white/5 text-left";

const Sidebar = () => {
  const {
    getUsers,
    getGroups,
    users,
    groups,
    selectedChat,
    setSelectedChat,
    isUsersLoading,
    typingUsers,
    setChatArchived,
    setChatPinned,
    setChatMuted,
    setChatLists,
    deleteChat,
    searchMessages,
    jumpToMessage,
  } = useChatStore(
    useShallow((st) => ({
      getUsers: st.getUsers,
      getGroups: st.getGroups,
      users: st.users,
      groups: st.groups,
      selectedChat: st.selectedChat,
      setSelectedChat: st.setSelectedChat,
      isUsersLoading: st.isUsersLoading,
      typingUsers: st.typingUsers,
      setChatArchived: st.setChatArchived,
      setChatPinned: st.setChatPinned,
      setChatMuted: st.setChatMuted,
      setChatLists: st.setChatLists,
      deleteChat: st.deleteChat,
      searchMessages: st.searchMessages,
      jumpToMessage: st.jumpToMessage,
    }))
  );

  const { onlineUsers, authUser, logout } = useAuthStore();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const listRef = useScrollMemory("chats");
  useBackToClose(showMenu, () => setShowMenu(false));
  const [showSelMenu, setShowSelMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Phone Back leaves the Archived folder (back to the main list).
  useBackToClose(showArchived, () => setShowArchived(false));

  // ---- Message search (server-side), shown under the matching chats ----
  const [msgResults, setMsgResults] = useState([]);
  const [msgSearching, setMsgSearching] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setMsgResults([]);
      setMsgSearching(false);
      return;
    }
    const mine = ++searchSeq.current;
    setMsgSearching(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchMessages(term);
        if (mine === searchSeq.current) setMsgResults(found);
      } catch {
        if (mine === searchSeq.current) setMsgResults([]);
      } finally {
        if (mine === searchSeq.current) setMsgSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchMessages]);

  // ---- Long-press selection (like WhatsApp): hold a chat to select it, tap more
  // to add, then Pin / Mute / Archive / Delete from the bar on top.
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const longPressed = useRef(false);
  const selecting = selected.size > 0;

  const addSelected = (key) => setSelected((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  const toggleSelected = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const clearSelected = () => {
    setSelected(new Set());
    setShowSelMenu(false);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const startPress = (key, e) => {
    longPressed.current = false;
    const t = e.touches?.[0];
    pressStart.current = t ? { x: t.clientX, y: t.clientY } : null;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      buzz(15);
      addSelected(key);
    }, 450);
  };
  const movePress = (e) => {
    const t = e.touches?.[0];
    if (!pressStart.current || !t) return;
    if (Math.abs(t.clientX - pressStart.current.x) > 10 || Math.abs(t.clientY - pressStart.current.y) > 10) cancelPress();
  };

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e) => e.key === "Escape" && setSelected(new Set());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);
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

  const archivedKeys = authUser?.archivedChats;
  const archivedSet = useMemo(() => new Set(archivedKeys || []), [archivedKeys]);
  const pinnedKeys = authUser?.pinnedChats;
  const pinnedSet = useMemo(() => new Set(pinnedKeys || []), [pinnedKeys]);
  const mutedKeys = authUser?.mutedChats;
  const mutedSet = useMemo(() => new Set(mutedKeys || []), [mutedKeys]);

  // Favourites (built in) + the user's own lists, kept on the account.
  const rawLists = authUser?.chatLists;
  const lists = useMemo(() => rawLists || [], [rawLists]);
  const favList = lists.find((l) => l.id === "favourites");
  const customLists = lists.filter((l) => l.id !== "favourites");
  const [listModal, setListModal] = useState(null); // null | { id } (id "new" = create)
  const activeList = filter.startsWith("list:") ? customLists.find((l) => `list:${l.id}` === filter) : null;
  const activeKeys = useMemo(() => {
    if (filter === "fav") return new Set(favList?.chats || []);
    if (activeList) return new Set(activeList.chats);
    return null;
  }, [filter, favList, activeList]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();

    const directItems = users
      .filter((u) => u.fullName.toLowerCase().includes(q))
      .map((u) => ({
        type: "direct",
        data: u,
        key: `d-${u._id}`,
        archived: archivedSet.has(`d:${u._id}`),
        pinned: pinnedSet.has(`d:${u._id}`),
        muted: mutedSet.has(`d:${u._id}`),
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
        archived: archivedSet.has(`g:${g._id}`),
        pinned: pinnedSet.has(`g:${g._id}`),
        muted: mutedSet.has(`g:${g._id}`),
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
      .filter((item) => item.archived === showArchived)
      .filter((item) => {
        if (filter === "unread") return item.unreadCount > 0;
        if (filter === "groups") return item.type === "group";
        if (filter === "online") return item.online;
        if (activeKeys) return activeKeys.has(`${item.type === "group" ? "g" : "d"}:${item.data._id}`);
        return true;
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.sortTime - a.sortTime);
  }, [users, groups, filter, search, onlineUsers, archivedSet, pinnedSet, mutedSet, showArchived, activeKeys]);

  const selectedItems = items.filter((i) => selected.has(i.key));
  const allPinned = selectedItems.length > 0 && selectedItems.every((i) => i.pinned);
  const allMuted = selectedItems.length > 0 && selectedItems.every((i) => i.muted);
  const chatOf = (i) => ({ type: i.type, data: i.data });

  const bulk = async (run, message) => {
    const targets = selectedItems;
    clearSelected();
    const results = await Promise.all(targets.map((i) => run(i)));
    if (results.every(Boolean) && message) toast(message(targets.length));
  };
  const onPin = () => {
    if (!allPinned) {
      const already = [...pinnedSet].filter((k) => !selectedItems.some((i) => `${i.type === "group" ? "g" : "d"}:${i.data._id}` === k)).length;
      if (already + selectedItems.length > 3) return toast.error("You can only pin 3 chats");
    }
    bulk((i) => setChatPinned(chatOf(i), !allPinned, { silent: true }), () => (allPinned ? "Chat unpinned" : "Chat pinned"));
  };
  const onMute = () =>
    bulk((i) => setChatMuted(chatOf(i), !allMuted, { silent: true }), () => (allMuted ? "Notifications on" : "Notifications muted"));
  const onArchive = () =>
    bulk((i) => setChatArchived(chatOf(i), !showArchived, { silent: true }), (n) =>
      showArchived ? `${n} chat${n > 1 ? "s" : ""} unarchived` : `${n} chat${n > 1 ? "s" : ""} archived`
    );
  // ---- Lists ----
  const keyOf = (i) => `${i.type === "group" ? "g" : "d"}:${i.data._id}`;
  const candidates = useMemo(
    () => [
      ...users.map((u) => ({ key: `d:${u._id}`, name: u.fullName, avatar: u.profilePic })),
      ...groups.map((g) => ({ key: `g:${g._id}`, name: g.name, avatar: g.groupPic })),
    ],
    [users, groups]
  );
  const putList = (id, name, chats) => {
    const exists = lists.some((l) => l.id === id);
    const next = exists ? lists.map((l) => (l.id === id ? { ...l, name, chats } : l)) : [...lists, { id, name, chats }];
    return setChatLists(next);
  };
  const addSelectedTo = async (id, name) => {
    const keys = selectedItems.map(keyOf);
    const cur = lists.find((l) => l.id === id)?.chats || [];
    const allIn = keys.every((k) => cur.includes(k));
    const chats = allIn ? cur.filter((k) => !keys.includes(k)) : [...new Set([...cur, ...keys])];
    clearSelected();
    const ok = await putList(id, name, chats);
    if (ok) toast(allIn ? `Removed from ${name}` : `Added to ${name}`);
  };
  const onDelete = async () => {
    setConfirmDelete(false);
    const targets = selectedItems;
    clearSelected();
    for (const i of targets) await deleteChat(chatOf(i));
    toast(`${targets.length} chat${targets.length > 1 ? "s" : ""} deleted`);
  };

  const totalUnread = useMemo(
    () =>
      users.reduce((sum, c) => sum + (archivedSet.has(`d:${c._id}`) ? 0 : c.unreadCount || 0), 0) +
      groups.reduce((sum, c) => sum + (archivedSet.has(`g:${c._id}`) ? 0 : c.unreadCount || 0), 0),
    [users, groups, archivedSet]
  );

  // Archived chats: how many, and how many have unread messages
  const archivedInfo = useMemo(() => {
    const all = [
      ...users.map((u) => ({ k: `d:${u._id}`, unread: u.unreadCount || 0 })),
      ...groups.map((g) => ({ k: `g:${g._id}`, unread: g.unreadCount || 0 })),
    ].filter((c) => archivedSet.has(c.k));
    return { count: all.length, unread: all.filter((c) => c.unread > 0).length };
  }, [users, groups, archivedSet]);

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="relative flex flex-col w-full lg:w-[400px] xl:w-[420px] shrink-0 h-full bg-wa-bg lg:border-r lg:border-white/5">
      {selecting && (
        <div className="flex items-center h-14 pl-1 pr-0 bg-wa-bg">
          <button onClick={clearSelected} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Cancel selection">
            <WaBack size={24} />
          </button>
          <span className="flex-1 text-[18.5px] leading-none font-normal text-wa-text pl-5">{selected.size}</span>
          <button onClick={onPin} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label={allPinned ? "Unpin" : "Pin"} title={allPinned ? "Unpin" : "Pin"}>
            {allPinned ? <WaUnpinAction /> : <WaPinAction />}
          </button>
          <button onClick={() => setConfirmDelete(true)} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Delete" title="Delete">
            <WaTrash />
          </button>
          <button onClick={onMute} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label={allMuted ? "Unmute" : "Mute"} title={allMuted ? "Unmute" : "Mute"}>
            {allMuted ? <WaBell /> : <WaBellOff />}
          </button>
          <button onClick={onArchive} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label={showArchived ? "Unarchive" : "Archive"} title={showArchived ? "Unarchive" : "Archive"}>
            <WaArchive up={showArchived} />
          </button>
          <div className="relative">
            <button onClick={() => setShowSelMenu((v) => !v)} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="More options">
              <WaKebab />
            </button>
            {showSelMenu && (
              <div className="absolute right-2 top-full mt-1 w-52 bg-wa-pop rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
                <button
                  className={menuItem}
                  onClick={() => {
                    setSelected(new Set(items.map((i) => i.key)));
                    setShowSelMenu(false);
                  }}
                >
                  Select all
                </button>
                <button
                  className={menuItem}
                  onClick={() => {
                    setShowSelMenu(false);
                    addSelectedTo("favourites", "Favourites");
                  }}
                >
                  {selectedItems.length > 0 && selectedItems.every((i) => favList?.chats.includes(keyOf(i)))
                    ? "Remove from Favourites"
                    : "Add to Favourites"}
                </button>
                {customLists.map((l) => (
                  <button
                    key={l.id}
                    className={menuItem}
                    onClick={() => {
                      setShowSelMenu(false);
                      addSelectedTo(l.id, l.name);
                    }}
                  >
                    <span className="truncate">
                      {selectedItems.length > 0 && selectedItems.every((i) => l.chats.includes(keyOf(i))) ? "Remove from" : "Add to"} {l.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Title + menu */}
      <div className={`${selecting ? "hidden" : "flex"} items-center justify-between ${showArchived ? "px-2 pt-3 pb-2 border-b border-white/5" : "px-4 pt-4 pb-3"}`}>
        {showArchived ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowArchived(false)}
              className="size-11 rounded-full flex items-center justify-center text-wa-text hover:bg-white/10 active:bg-white/15 transition-colors"
              aria-label="Back to chats"
            >
              <WaBack size={24} />
            </button>
            <h1 className="text-[18.5px] leading-none font-normal text-wa-text">Archived</h1>
          </div>
        ) : (
          <h1 className="text-[24px] lg:text-[20.5px] leading-none font-bold tracking-tight text-wa-text">Talkies</h1>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((s) => !s)}
            className="size-11 rounded-full flex items-center justify-center text-wa-text hover:bg-white/10 active:bg-white/15 transition-colors"
            aria-label="Menu"
          >
            <WaKebab size={24} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-wa-pop rounded-2xl shadow-2xl py-2 z-30 overflow-hidden">
              <button
                className={menuItem}
                onClick={() => {
                  setShowMenu(false);
                  setShowCreateGroup(true);
                }}
              >
                <UsersRound size={18} className="text-wa-icon" /> New group
              </button>
              <Link to="/profile" className={menuItem} onClick={() => setShowMenu(false)}>
                <UserRound size={18} className="text-wa-icon" /> Profile
              </Link>
              <Link to="/settings" className={menuItem} onClick={() => setShowMenu(false)}>
                <Settings size={18} className="text-wa-icon" /> Settings
              </Link>
              <button className={`${menuItem} text-red-400`} onClick={logout}>
                <LogOut size={18} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Archived: WhatsApp's info banner instead of search + chips */}
      {showArchived && !selecting && (
        <p className="px-6 py-4 text-center text-[13px] leading-snug text-wa-muted border-b border-white/5">
          These chats stay archived when new messages are received.
        </p>
      )}

      {/* Search pill */}
      {!showArchived && (
      <div className={`px-4 pb-3 ${selecting ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-3 h-12 lg:h-10 rounded-full bg-wa-surface px-4 focus-within:ring-2 focus-within:ring-[#25D366]/50">
          <Search size={20} className="text-wa-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 min-w-0 bg-transparent text-[13.5px] lg:text-[13px] text-wa-text placeholder:text-wa-muted focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-wa-muted hover:text-wa-text" aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Filter chips — not shown inside the Archived folder (WhatsApp shows just the archived chats) */}
      {!showArchived && (
      <div className={`flex gap-2 lg:gap-1.5 overflow-x-auto no-scrollbar px-4 lg:px-3 pb-3 lg:pb-2.5 ${selecting ? "opacity-50 pointer-events-none" : ""}`}>
        {[
          ...FILTERS.slice(0, 3),
          ...customLists.map((l) => ({ id: `list:${l.id}`, label: l.name })),
          { id: "__new" },
          ...FILTERS.slice(3),
        ].map(({ id, label }) => {
          if (id === "__new") return (
        <button key="__new"
          onClick={() => setListModal({ id: "new" })}
          className="h-10 lg:h-8 px-4 lg:px-3 rounded-full text-[13.5px] lg:text-[12px] shrink-0 whitespace-nowrap border border-wa-field text-wa-icon hover:bg-white/5 flex items-center gap-1"
          title="New list"
          aria-label="New list"
        >
          <span className="text-[17px] lg:text-[15.5px] leading-none">+</span>
          <span className="lg:hidden">New list</span>
        </button>
          );
          const active = filter === id;
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`h-10 lg:h-8 px-4 lg:px-3 rounded-full text-[13.5px] lg:text-[11.5px] shrink-0 whitespace-nowrap border transition-colors ${
                active
                  ? "bg-wa-tint border-transparent text-wa-tinttext font-medium"
                  : "border-wa-field text-wa-icon hover:bg-white/5"
              }`}
            >
              {label}
              {id === "unread" && totalUnread > 0 && <span className="ml-1.5 text-[#25D366]">{totalUnread}</span>}
            </button>
          );
        })}
      </div>
      )}

      {/* Chat list */}
      <div ref={listRef} className="overflow-y-auto flex-1 pb-24">
        {!showArchived && activeKeys && !search && (
          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-[12px] text-wa-muted">
              {filter === "fav" ? "Favourites" : activeList?.name} · {items.length} chat{items.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => setListModal({ id: filter === "fav" ? "favourites" : activeList.id })}
              className="text-[12px] font-medium text-[#25D366] px-2 py-1"
            >
              {filter === "fav" ? "Add" : "Edit"}
            </button>
          </div>
        )}
        {!showArchived && archivedInfo.count > 0 && !search && filter === "all" && (
          <button
            onClick={() => {
              setFilter("all");
              setShowArchived(true);
            }}
            className="w-full pl-3 pr-4 py-2.5 flex items-center gap-3 text-left hover:bg-wa-surface/70 active:bg-wa-surface transition-colors"
          >
            <span className="size-12 flex items-center justify-center text-wa-muted">
              <WaArchive size={26} />
            </span>
            <span className="flex-1 text-[14.5px] text-wa-muted">Archived</span>
            {archivedInfo.unread > 0 && (
              <span className="text-[11px] font-medium text-[#25D366]">{archivedInfo.unread}</span>
            )}
          </button>
        )}

        {items.map((item) => {
          const isSelected = selectedChat?.type === item.type && selectedChat.data._id === item.data._id;
          const hasUnread = item.unreadCount > 0;
          const sentByMe = item.lastMessage && item.lastMessage.senderId === authUser?._id;
          const isTyping =
            (typingUsers[item.type === "group" ? `group:${item.data._id}` : item.data._id]?.size ?? 0) > 0;

          return (
            <div key={item.key} className="group relative">
            <button
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                if (selecting) toggleSelected(item.key);
                else setSelectedChat({ type: item.type, data: item.data });
              }}
              onTouchStart={(e) => startPress(item.key, e)}
              onTouchMove={movePress}
              onTouchEnd={cancelPress}
              onTouchCancel={cancelPress}
              onContextMenu={(e) => {
                e.preventDefault(); // right-click on desktop / long-press on Android
                addSelected(item.key);
              }}
              style={{ WebkitTouchCallout: "none" }}
              className={`w-full select-none pl-3 pr-4 py-[14px] lg:py-3 flex items-center gap-3 lg:gap-3.5 text-left transition-colors hover:bg-wa-surface/70 active:bg-wa-surface ${
                selected.has(item.key) ? "bg-[#0C3B2C]" : isSelected ? "lg:bg-wa-field" : ""
              }`}
            >
              <div className="relative shrink-0">
                <Avatar src={item.avatar} name={item.name} isGroup={item.type === "group"} size="size-12" />
                {selected.has(item.key) && (
                  <span className="absolute -bottom-1 -right-1 size-[22px] rounded-full bg-[#21C063] text-wa-bg ring-2 ring-wa-bg flex items-center justify-center">
                    <WaCheck size={14} />
                  </span>
                )}
                {item.online && (
                  <span className="absolute bottom-0 right-0 size-3.5 bg-[#25D366] rounded-full ring-[3px] ring-wa-bg" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14.5px] lg:text-[13.5px] leading-[22px] text-wa-text truncate">{item.name}</span>
                  {item.lastMessage && (
                    <span
                      className={`text-[10px] lg:text-[10.5px] leading-none shrink-0 ${hasUnread ? "text-[#25D366] font-medium" : "text-wa-muted"}`}
                    >
                      {formatChatListTime(item.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 mt-[3px]">
                  {isTyping ? (
                    <span className="min-w-0 truncate text-[13px] text-[#25D366]">typing…</span>
                  ) : (
                  <span
                    className={`flex items-center gap-1 min-w-0 text-[12.5px] lg:text-[12px] leading-5 ${
                      hasUnread ? "text-wa-text" : "text-wa-muted"
                    }`}
                  >
                    {sentByMe && item.type === "direct" && (
                      <span className="shrink-0 text-wa-muted">
                        <MessageTicks message={item.lastMessage} />
                      </span>
                    )}
                    <span className="truncate">
                      {sentByMe && item.type === "group" ? "You: " : ""}
                      {lastMessagePreview(item.lastMessage)}
                    </span>
                  </span>
                  )}
                  <span className="flex items-center gap-1.5 shrink-0 text-wa-muted">
                    {item.muted && <WaBellOff size={16} />}
                    {hasUnread ? (
                      <span
                        className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-medium flex items-center justify-center ${
                          item.muted ? "bg-[#3B4A54] text-wa-text" : "bg-[#25D366] text-wa-bg"
                        }`}
                      >
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </span>
                    ) : (
                      item.pinned && <WaPinSolid size={18} />
                    )}
                  </span>
                </div>
              </div>
            </button>
            </div>
          );
        })}

        {!showArchived && search.trim().length >= 2 && msgResults.length > 0 && (
          <div className="pt-2">
            <p className="px-4 py-2 text-[11px] font-medium text-[#25D366]">Messages</p>
            {msgResults.map((r) => {
              const chat =
                r.chatType === "group"
                  ? groups.find((g) => g._id === r.chatId)
                  : users.find((u) => u._id === r.chatId);
              if (!chat) return null;
              const name = r.chatType === "group" ? chat.name : chat.fullName;
              return (
                <button
                  key={r._id}
                  onClick={() => jumpToMessage({ type: r.chatType, data: chat }, r._id)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-wa-surface/70 active:bg-wa-surface"
                >
                  <Avatar
                    src={r.chatType === "group" ? chat.groupPic : chat.profilePic}
                    name={name}
                    isGroup={r.chatType === "group"}
                    size="size-12"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13.5px] text-wa-text truncate">{name}</p>
                      <span className="text-xs text-wa-muted shrink-0">
                        {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <SearchSnippet text={r.text} query={search} className="text-[12px] text-wa-muted line-clamp-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {items.length === 0 && msgResults.length === 0 && !msgSearching && (
          <div className="text-center text-wa-muted py-10 px-6 text-[13px]">
            {search
              ? `No chats matching “${search}”`
              : showArchived
              ? "No archived chats"
              : filter === "all"
              ? "No chats yet"
              : activeKeys
              ? "No chats in this list yet. Tap Add / Edit above, or select chats and use ⋮ → Add to list."
              : "Nothing here"}
          </div>
        )}
      </div>

      {/* Floating action button */}
      <button
        onClick={() => setShowCreateGroup(true)}
        className="absolute bottom-4 right-4 size-14 rounded-2xl bg-[#21C063] hover:bg-[#1fb85f] active:scale-95 text-wa-bg flex items-center justify-center shadow-lg shadow-black/40 transition-all"
        aria-label="New chat"
        title="New chat"
      >
        <WaNewChat size={28} />
      </button>

      {listModal && (() => {
        const isNew = listModal.id === "new";
        const isFav = listModal.id === "favourites";
        const cur = isNew ? null : isFav ? favList : customLists.find((l) => l.id === listModal.id);
        const id = isNew ? `l${Date.now().toString(36)}` : listModal.id;
        return (
          <ChatListModal
            title={isNew ? "New list" : isFav ? "Favourites" : "Edit list"}
            initialName={isFav ? "Favourites" : cur?.name || ""}
            nameEditable={!isFav}
            initialKeys={cur?.chats || []}
            candidates={candidates}
            onClose={() => setListModal(null)}
            onSave={async (name, chats) => {
              if (customLists.length >= 10 && isNew) return toast.error("You can have up to 10 lists"), false;
              const ok = await putList(id, name, chats);
              if (ok && isNew) setFilter(`list:${id}`);
              return ok;
            }}
            onDelete={
              isNew || isFav
                ? undefined
                : async () => {
                    const ok = await setChatLists(lists.filter((l) => l.id !== id));
                    if (ok) setFilter("all");
                    return ok;
                  }
            }
          />
        );
      })()}

      {confirmDelete && (
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-wa-pop rounded-2xl w-full max-w-xs p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14.5px] font-medium text-wa-text">
              Delete {selected.size > 1 ? `${selected.size} chats` : "this chat"}?
            </h3>
            <p className="text-sm text-wa-muted mt-2">
              Messages are removed from your account only. {selected.size > 1 ? "Others keep their copies." : "The other side keeps their copy."}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmDelete(false)} className="px-4 h-10 rounded-full text-[#25D366] hover:bg-white/5">
                Cancel
              </button>
              <button onClick={onDelete} className="px-4 h-10 rounded-full text-red-400 hover:bg-white/5 font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
