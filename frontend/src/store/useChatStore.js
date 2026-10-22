import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { readChatCache, writeChatCache } from "../lib/chatCache";
import {
  playNotificationSound,
  showDesktopNotification,
  shouldLeaveToSystemAlert,
  isPushActive,
} from "../lib/notificationSound";
import { vibrationPattern } from "../lib/soundSettings";
import { useChatLockStore, isChatLocked } from "./useChatLockStore";

function notifyIncoming(senderName, message, isGroup = false) {
  // Muted chats stay silent (the unread badge still counts).
  const muteKey = isGroup ? `g:${message.groupId}` : `d:${message.senderId}`;
  if (useAuthStore.getState().authUser?.mutedChats?.includes(muteKey)) return;
  // Phone with the app in the background: the system notification (from Web
  // Push) carries the sound — don't also try to play one from a frozen page.
  if (shouldLeaveToSystemAlert()) return;
  const locked = useAuthStore.getState().authUser?.lockedChats?.includes(muteKey);
  playNotificationSound(isGroup);
  const buzz = vibrationPattern(isGroup ? "group" : "message");
  if (buzz) navigator.vibrate?.(buzz);
  // With Web Push active the service worker shows the notification itself.
  if (isPushActive()) return;
  const body = message.image ? "📷 Photo" : message.text || "New message";
  showDesktopNotification(locked ? "Talkies" : isGroup ? `${senderName}` : senderName, {
    body: locked ? "You have a new message" : isGroup && message.text ? message.text : body,
    icon: "/icon-v2-192.png",
    tag: isGroup ? `group-${message.groupId}` : `dm-${message.senderId}`,
  });
}

const PAGE_SIZE = 40; // messages fetched per page (newest first, older on demand) — small = opens fast
// ---- speed helpers ----
// "I read it": over the live connection when there is one (arrives at once), HTTP only as a fallback.
const emitSeen = (senderId) => {
  const socket = useAuthStore.getState().socket;
  if (socket?.connected) socket.emit("markSeen", { from: senderId });
  else axiosInstance.put(`/messages/seen/${senderId}`).catch(() => {});
};
// Messages that couldn't reach the server (offline). Resent automatically when the connection returns.
const outbox = new Map(); // tmpId -> { to, body }
let flushing = false;
const flushOutbox = async () => {
  if (flushing || !outbox.size) return;
  flushing = true;
  try {
    for (const [tmpId, job] of [...outbox]) {
      useChatStore.setState((st) => ({ messages: st.messages.map((m) => (m._id === tmpId ? { ...m, pending: true, failed: false } : m)) }));
      try {
        const live = useAuthStore.getState().socket;
        let res;
        try {
          if (!live?.connected) throw { transport: true };
          res = await sendOverSocket(live, job.to, job.body);
        } catch (e) {
          if (!e?.transport) throw e;
          res = await axiosInstance.post(`/messages/send/${job.to}`, job.body);
        }
        outbox.delete(tmpId);
        const real = res.data;
        useChatStore.setState((st) => {
          const active = st.selectedChat?.type === "direct" && st.selectedChat.data._id === job.to;
          let used = false;
          const out = [];
          for (const m of st.messages) {
            if (m._id === tmpId || m._id === real._id) {
              if (used) continue;
              used = true;
              out.push(real);
            } else out.push(m);
          }
          if (!used && active) out.push(real);
          return {
            messages: out,
            users: st.users.map((u) => (u._id === job.to ? { ...u, lastMessage: real } : u)),
          };
        });
      } catch (err) {
        if (err?.response) {
          // the server refused it (blocked, not allowed…): stop trying
          outbox.delete(tmpId);
          useChatStore.setState((st) => ({ messages: st.messages.map((m) => (m._id === tmpId ? { ...m, pending: false, failed: true } : m)) }));
          toast.error(err.response?.data?.error || "Message not sent");
        } else {
          useChatStore.setState((st) => ({ messages: st.messages.map((m) => (m._id === tmpId ? { ...m, pending: false, failed: true } : m)) }));
          break; // still offline — try again later
        }
      }
    }
  } finally {
    flushing = false;
  }
};
if (typeof window !== "undefined") window.addEventListener("online", () => setTimeout(flushOutbox, 300));

// Send a plain text message over the live connection. Resolves like an HTTP call would; rejects with
// `transport: true` when the connection didn't answer in time (the caller then retries over HTTP —
// the shared clientId stops that from ever creating a duplicate).
const sendOverSocket = (socket, to, body) =>
  new Promise((resolve, reject) => {
    socket.timeout(2500).emit("sendDirect", { to, body }, (err, r) => {
      if (err || !r) return reject({ transport: true });
      if (r.status >= 200 && r.status < 300) return resolve({ data: r.body });
      reject({ response: { status: r.status, data: r.body } });
    });
  });
// Warm the newest chats in ONE request, so opening them later is instant.
let prefetchedFor = null;
const prefetchTopChats = async (users) => {
  const me = useAuthStore.getState().authUser?._id;
  if (!me || prefetchedFor === me || !users?.length) return;
  prefetchedFor = me;
  const ids = users
    .filter((u) => u.lastMessage && !u.isSelf && !msgCache.has(`d:${u._id}`))
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt))
    .slice(0, 8)
    .map((u) => u._id);
  if (!ids.length) return;
  try {
    const res = await axiosInstance.get("/messages/prefetch", { params: { ids: ids.join(","), limit: PAGE_SIZE } });
    for (const [id, list] of Object.entries(res.data || {})) {
      const key = `d:${id}`;
      if (!msgCache.has(key) && Array.isArray(list)) {
        msgCache.set(key, list);
        writeChatCache(me, `msgs-${key}`, list.slice(-40));
      }
    }
  } catch {
    /* best effort */
  }
};
const msgCache = new Map(); // chatKey -> last known messages (instant re-open)
const chatKeyOf = (chat) => `${chat.type === "group" ? "g" : "d"}:${chat.data._id}`;
const FLAG_API = {
  archivedChats: { url: "/messages/archive", body: (v) => ({ archived: v }), on: "Chat archived", off: "Chat unarchived", icon: "🗄️" },
  pinnedChats: { url: "/messages/pin-chat", body: (v) => ({ value: v }), on: "Chat pinned", off: "Chat unpinned", icon: "📌" },
  markedUnread: { url: "/messages/mark-unread", body: (v) => ({ value: v }), on: "Marked as unread", off: "Marked as read", icon: "🟢" },
  mutedChats: { url: "/messages/mute-chat", body: (v) => ({ value: v }), on: "Notifications muted", off: "Notifications on", icon: "🔕" },
};
let usersInFlight = null;
let groupsInFlight = null;

export const useChatStore = create((set, get) => ({
  // Sidebar data
  users: [],
  groups: [],
  isUsersLoading: false,
  isGroupsLoading: false,

  // Active conversation: { type: "direct" | "group", data: user|group }
  selectedChat: null,
  // Long-press selection of messages (WhatsApp's multi-select bar)
  selectedMsgIds: [],
  toggleSelectMessage: (id) =>
    set((state) => ({ selectedMsgIds: state.selectedMsgIds.includes(id) ? state.selectedMsgIds.filter((x) => x !== id) : [...state.selectedMsgIds, id] })),
  clearMsgSelection: () => set({ selectedMsgIds: [] }),

  messages: [],
  hasMoreMessages: false,
  isLoadingOlder: false,
  isFetchingMessages: false,
  pendingJump: null, // { id } — a search result to scroll to once its chat/messages are loaded
  chatSearchOpen: false,
  isMessagesLoading: false,
  editingMessage: null, // message being edited (text goes back into the input)
  replyingTo: null, // message currently being replied to (shown above the input)

  // userId (direct) / groupId (group) -> Set of typing userIds
  typingUsers: {},

  socketSubscribed: false,

  getUsers: () => {
    if (usersInFlight) return usersInFlight;
    usersInFlight = get()._fetchUsers().finally(() => (usersInFlight = null));
    return usersInFlight;
  },

  _fetchUsers: async () => {
    // Show the last-known list immediately (and only fall back to the skeleton
    // when there's nothing at all to show), then refresh from the server.
    const userId = useAuthStore.getState().authUser?._id;
    if (get().users.length === 0) {
      const cached = readChatCache(userId, "users");
      if (cached?.length) set({ users: cached });
    }
    set({ isUsersLoading: get().users.length === 0 });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
      writeChatCache(userId, "users", res.data);
      setTimeout(() => prefetchTopChats(res.data), 400);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getGroups: () => {
    if (groupsInFlight) return groupsInFlight;
    groupsInFlight = get()._fetchGroups().finally(() => (groupsInFlight = null));
    return groupsInFlight;
  },

  _fetchGroups: async () => {
    const userId = useAuthStore.getState().authUser?._id;
    if (get().groups.length === 0) {
      const cached = readChatCache(userId, "groups");
      if (cached?.length) set({ groups: cached });
    }
    set({ isGroupsLoading: get().groups.length === 0 });
    try {
      const res = await axiosInstance.get("/groups");
      set({ groups: res.data });
      writeChatCache(userId, "groups", res.data);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load groups");
    } finally {
      set({ isGroupsLoading: false });
    }
  },

  // Per-account chat flags (archived / pinned / muted), synced across devices by
  // the server. Updates the list optimistically and rolls back if the call fails.
  // Returns true when it worked. `silent` skips the toast (bulk actions).
  // Disappearing-message timer per 1:1 chat: { [otherUserId]: seconds }
  directDisappear: {},
  directVanish: {}, // Vanish mode per 1:1 chat: { [otherUserId]: boolean }
  setDirectVanish: async (userId, on) => {
    try {
      await axiosInstance.put(`/messages/vanish/${userId}`, { on });
      set((state) => ({ directVanish: { ...state.directVanish, [userId]: on } }));
      toast(on ? "Vanish mode on" : "Vanish mode off", { icon: "👻" });
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't change Vanish mode");
    }
  },
  loadDirectDisappear: async (userId) => {
    try {
      const res = await axiosInstance.get(`/messages/disappearing/${userId}`);
      set((state) => ({ directDisappear: { ...state.directDisappear, [userId]: res.data.seconds || 0 }, directVanish: { ...state.directVanish, [userId]: !!res.data.vanish } }));
    } catch {
      /* keep what we had */
    }
  },
  setDirectDisappearing: async (userId, seconds) => {
    try {
      const res = await axiosInstance.put(`/messages/disappearing/${userId}`, { seconds });
      set((state) => ({ directDisappear: { ...state.directDisappear, [userId]: res.data.seconds || 0 } }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't change disappearing messages");
    }
  },

  setChatFlag: async (field, chat, value, { silent = false, until = null } = {}) => {
    const api = FLAG_API[field];
    const key = chatKeyOf(chat);
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return false;
    const prev = authUser[field] || [];
    const next = value ? [...new Set([...prev, key])] : prev.filter((k) => k !== key);
    useAuthStore.setState({ authUser: { ...authUser, [field]: next } });
    try {
      const res = await axiosInstance.put(api.url, {
        chatType: chat.type,
        chatId: chat.data._id,
        ...api.body(value),
        ...(until ? { until } : {}),
      });
      useAuthStore.setState((state) => ({
        authUser: state.authUser ? { ...state.authUser, [field]: res.data[field] } : state.authUser,
      }));
      if (!silent) toast(value ? api.on : api.off, { icon: api.icon });
      return true;
    } catch (error) {
      useAuthStore.setState((state) => ({
        authUser: state.authUser ? { ...state.authUser, [field]: prev } : state.authUser,
      }));
      toast.error(error.response?.data?.error || "Couldn't update chat");
      return false;
    }
  },

  setChatArchived: (chat, archived, opts) => get().setChatFlag("archivedChats", chat, archived, opts),
  setChatPinned: (chat, pinned, opts) => get().setChatFlag("pinnedChats", chat, pinned, opts),
  // Mark a chat's real unread messages as read without opening it.
  markChatRead: async (chat) => {
    try {
      if (chat.type === "direct") await axiosInstance.put(`/messages/seen/${chat.data._id}`);
      else await axiosInstance.get(`/groups/${chat.data._id}/messages`, { params: { limit: 1 } });
    } catch {
      return;
    }
    set((state) =>
      chat.type === "direct"
        ? { users: state.users.map((u) => (u._id === chat.data._id ? { ...u, unreadCount: 0 } : u)) }
        : { groups: state.groups.map((g) => (g._id === chat.data._id ? { ...g, unreadCount: 0 } : g)) }
    );
  },
  setChatMarkedUnread: (chat, v, opts) => get().setChatFlag("markedUnread", chat, v, opts),
  setChatMuted: (chat, muted, opts) => get().setChatFlag("mutedChats", chat, muted, opts),

  // Favourites + custom lists: [{ id, name, chats: ["d:<id>"|"g:<id>"] }].
  // Optimistic, rolled back on failure. Returns true when saved.
  setChatLists: async (lists) => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return false;
    const prev = authUser.chatLists || [];
    useAuthStore.setState({ authUser: { ...authUser, chatLists: lists } });
    try {
      const res = await axiosInstance.put("/messages/chat-lists", { lists });
      useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, chatLists: res.data.chatLists } } : {}));
      return true;
    } catch (error) {
      useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, chatLists: prev } } : {}));
      toast.error(error.response?.data?.error || "Couldn't update list");
      return false;
    }
  },

  // Privacy switches (read receipts / typing / online). Optimistic with rollback.
  updatePrivacy: async (patch) => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return false;
    const prev = authUser.privacy || {};
    useAuthStore.setState({ authUser: { ...authUser, privacy: { ...prev, ...patch } } });
    try {
      const res = await axiosInstance.put("/messages/privacy", patch);
      useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, privacy: res.data.privacy } } : {}));
      return true;
    } catch (error) {
      useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, privacy: prev } } : {}));
      toast.error(error.response?.data?.error || "Couldn't update privacy");
      return false;
    }
  },

  setUserBlocked: async (userId, blocked) => {
    try {
      const res = await axiosInstance.put("/messages/block-user", { userId, blocked });
      useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, blockedUsers: res.data.blockedUsers } } : {}));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't update block");
      return false;
    }
  },

  // Delete a chat for me (the other side keeps theirs).
  // Clear chat: empties the conversation but keeps it in the list. Starred
  // messages can be kept, like WhatsApp.
  clearChat: async (chat, keepStarred) => {
    try {
      await axiosInstance.delete(`/messages/chat/${chat.type}/${chat.data._id}`, { params: keepStarred ? { keepStarred: 1 } : {} });
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't clear chat");
      return false;
    }
    msgCache.delete(chatKeyOf(chat));
    writeChatCache(useAuthStore.getState().authUser?._id, `msgs-${chatKeyOf(chat)}`, []);
    await get().getMessages();
    const left = get().messages;
    const last = left[left.length - 1] || null;
    set((state) => ({
      users: chat.type === "direct" ? state.users.map((u) => (u._id === chat.data._id ? { ...u, lastMessage: last, unreadCount: 0 } : u)) : state.users,
      groups: chat.type === "group" ? state.groups.map((g) => (g._id === chat.data._id ? { ...g, lastMessage: last, unreadCount: 0 } : g)) : state.groups,
    }));
    return true;
  },
  deleteChat: async (chat) => {
    try {
      await axiosInstance.delete(`/messages/chat/${chat.type}/${chat.data._id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't delete chat");
      return false;
    }
    const key = chatKeyOf(chat);
    const id = chat.data._id;
    msgCache.delete(key);
    writeChatCache(useAuthStore.getState().authUser?._id, `msgs-${key}`, []);
    set((state) => {
      const cur = state.selectedChat;
      const isOpen = cur && cur.type === chat.type && cur.data._id === id;
      return {
        users:
          chat.type === "direct"
            ? state.users.map((u) => (u._id === id ? { ...u, lastMessage: null, unreadCount: 0 } : u))
            : state.users,
        groups:
          chat.type === "group"
            ? state.groups.map((g) => (g._id === id ? { ...g, lastMessage: null, unreadCount: 0 } : g))
            : state.groups,
        messages: isOpen ? [] : state.messages,
      };
    });
    return true;
  },

  setSelectedChat: (chat) => {
    if (get().selectedMsgIds.length) set({ selectedMsgIds: [] });
    // Leaving a chat means its messages were read: remember that in the quick-reopen copy,
    // so the "N unread messages" divider doesn't come back the next time it's opened.
    const prev = get().selectedChat;
    // Vanish mode: leaving the chat removes what you have read (the server deletes it for both of you)
    if (prev?.type === "direct" && get().directVanish[prev.data._id] && (!chat || chatKeyOf(prev) !== chatKeyOf(chat))) {
      axiosInstance.post(`/messages/vanish/clear/${prev.data._id}`).catch(() => {});
    }
    if (prev && (!chat || chatKeyOf(prev) !== chatKeyOf(chat)) && get().messages.length) {
      const me = useAuthStore.getState().authUser?._id;
      const key = chatKeyOf(prev);
      const readList = get().messages.map((m) =>
        m.senderId === me || m.pending
          ? m
          : { ...m, seen: true, seenBy: prev.type === "group" ? [...new Set([...(m.seenBy || []), me])] : m.seenBy }
      );
      msgCache.set(key, readList);
      writeChatCache(me, `msgs-${key}`, readList.slice(-40));
    }
    if (!chat) {
      set({ selectedChat: null, messages: [], hasMoreMessages: false, chatSearchOpen: false, pendingJump: null });
      return;
    }
    // Re-opening a chat is instant: show what we last had (memory, then disk)
    // right away and refresh from the server in the background.
    const key = chatKeyOf(chat);
    // Locked chats open only after the PIN has been entered
    if (isChatLocked(chat) && !useChatLockStore.getState().unlocked) {
      useChatLockStore.getState().requestUnlock(() => get().setSelectedChat(chat));
      return;
    }
    const userId = useAuthStore.getState().authUser?._id;
    const cached = msgCache.get(key) || readChatCache(userId, `msgs-${key}`) || [];
    set({ selectedChat: chat, messages: cached, hasMoreMessages: false, chatSearchOpen: false });
    if (useAuthStore.getState().authUser?.markedUnread?.includes(key)) get().setChatMarkedUnread(chat, false, { silent: true });
    if (chat.type === "direct" && !chat.data?.isSelf) emitSeen(chat.data._id);
    get().getMessages();
  },

  setChatSearchOpen: (open) => set({ chatSearchOpen: open }),

  // Search messages: everywhere, or inside one chat when `chat` is given.
  searchMessages: async (q, chat, kind) => {
    const params = { q };
    if (kind) params.kind = kind;
    if (chat) {
      params.chatType = chat.type;
      params.chatId = chat.data._id;
    }
    const res = await axiosInstance.get("/messages/search/all", { params });
    return res.data;
  },

  // Open a chat and scroll to one message in it (loading older pages if needed).
  jumpToMessage: (chat, messageId) => {
    const cur = get().selectedChat;
    const same = cur && cur.type === chat.type && cur.data._id === chat.data._id;
    if (!same) get().setSelectedChat(chat);
    set({ pendingJump: { id: messageId }, chatSearchOpen: false });
  },
  clearPendingJump: () => set({ pendingJump: null }),

  getMessages: async () => {
    const chat = get().selectedChat;
    if (!chat) return;
    const isSame = () => {
      const cur = get().selectedChat;
      return !!cur && cur.type === chat.type && cur.data._id === chat.data._id;
    };
    // Only show the skeleton when there is nothing at all to show yet.
    set({ isMessagesLoading: get().messages.length === 0, isFetchingMessages: true });
    try {
      const url = chat.type === "direct" ? `/messages/${chat.data._id}` : `/groups/${chat.data._id}/messages`;
      const res = await axiosInstance.get(url, { params: { limit: PAGE_SIZE } });
      // The person may have switched chats while this was loading — never let a
      // slow response paint over the chat they're looking at now.
      if (!isSame()) return;

      // Keep any older pages already scrolled into view (reconnect resync).
      const fresh = res.data;
      const firstFresh = fresh[0]?.createdAt;
      const older = firstFresh ? get().messages.filter((m) => m.createdAt < firstFresh) : [];
      const base = older.length ? [...older, ...fresh] : fresh;
      // Messages still on their way (clock) stay visible; never show the same message twice.
      const seenIds = new Set(base.map((m) => m._id));
      const clientIds = new Set(base.map((m) => m.clientId).filter(Boolean));
      const me0 = useAuthStore.getState().authUser?._id;
      const inFlight = get().messages.filter(
        (m) =>
          (m.pending || m.failed) &&
          !seenIds.has(m._id) &&
          !clientIds.has(m._id) &&
          // same text from me, sent at about the same time = the real copy is already in the list
          !base.some((r) => r.senderId === me0 && r.text === m.text && Math.abs(new Date(r.createdAt) - new Date(m.createdAt)) < 120000)
      );
      const merged = inFlight.length ? [...base, ...inFlight] : base;
      set((state) => ({
        messages: merged,
        hasMoreMessages: older.length ? state.hasMoreMessages : fresh.length >= PAGE_SIZE,
      }));

      // The chat list shows the latest message's ticks: bring it up to date with what we just loaded, so a
      // read receipt seen inside the chat is never missing from the list.
      if (chat.type === "direct" && fresh.length) {
        const last = fresh[fresh.length - 1];
        set((state) => ({
          users: state.users.map((u) =>
            u._id === chat.data._id && u.lastMessage && (u.lastMessage._id === last._id || new Date(last.createdAt) > new Date(u.lastMessage.createdAt))
              ? { ...u, lastMessage: { ...u.lastMessage, ...last } }
              : u
          ),
        }));
      }
      const key = chatKeyOf(chat);
      msgCache.set(key, fresh);
      const userId = useAuthStore.getState().authUser?._id;
      setTimeout(() => writeChatCache(userId, `msgs-${key}`, fresh.slice(-40)), 0);

      if (chat.type === "direct") {
        // Mark as seen + clear unread badge locally
        emitSeen(chat.data._id);
        set((state) => ({
          users: state.users.map((u) => (u._id === chat.data._id ? { ...u, unreadCount: 0 } : u)),
        }));
      } else {
        set((state) => ({
          groups: state.groups.map((g) => (g._id === chat.data._id ? { ...g, unreadCount: 0 } : g)),
        }));
      }
    } catch (error) {
      if (isSame()) toast.error(error.response?.data?.error || "Failed to load messages");
    } finally {
      if (isSame()) set({ isMessagesLoading: false, isFetchingMessages: false });
    }
  },

  // "Load older messages": fetch the page before the oldest one we have.
  loadOlderMessages: async () => {
    const { selectedChat: chat, messages, isLoadingOlder, hasMoreMessages } = get();
    if (!chat || isLoadingOlder || !hasMoreMessages || messages.length === 0) return false;
    set({ isLoadingOlder: true });
    try {
      const url = chat.type === "direct" ? `/messages/${chat.data._id}` : `/groups/${chat.data._id}/messages`;
      const res = await axiosInstance.get(url, { params: { before: messages[0].createdAt, limit: PAGE_SIZE } });
      const cur = get().selectedChat;
      if (!cur || cur.type !== chat.type || cur.data._id !== chat.data._id) return false;
      set((state) => ({
        messages: [...res.data, ...state.messages],
        hasMoreMessages: res.data.length >= PAGE_SIZE,
      }));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load older messages");
      return false;
    } finally {
      set({ isLoadingOlder: false });
    }
  },

  retryFailed: () => flushOutbox(),

  sendMessage: async (messageData) => {
    const { selectedChat, messages, replyingTo } = get();
    if (!selectedChat) return;
    try {
      const url =
        selectedChat.type === "direct"
          ? `/messages/send/${selectedChat.data._id}`
          : `/groups/${selectedChat.data._id}/messages`;
      const payload = replyingTo ? { ...messageData, replyTo: replyingTo._id } : messageData;

      // Plain text shows up in the chat at once (with a clock) and is swapped
      // for the real message when the server confirms — no waiting on the network.
      const me = useAuthStore.getState().authUser;
      const simple = !!messageData.text && !messageData.image && !messageData.file && !messageData.poll && !messageData.event && !messageData.liveLocation && !messageData.contactUserId && !messageData.statusId;
      const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (simple && me) {
        const temp = {
          _id: tmpId,
          pending: true,
          senderId: me._id,
          ...(selectedChat.type === "direct" ? { receiverId: selectedChat.data._id } : { groupId: selectedChat.data._id }),
          text: messageData.text,
          replyTo: replyingTo ? { _id: replyingTo._id, text: replyingTo.text, image: replyingTo.image, file: replyingTo.file, senderId: replyingTo.senderId } : null,
          createdAt: new Date().toISOString(),
          delivered: false,
          seen: false,
        };
        set({ messages: [...messages, temp], replyingTo: null });
      }
      let res;
      try {
        if (simple && selectedChat.type === "direct" && !selectedChat.data?.isSelf) {
          // Plain text goes over the live connection (no new request, no extra lookups); if it doesn't
          // answer in time, the same message (same clientId) is sent over HTTP — never duplicated.
          const live = useAuthStore.getState().socket;
          const body = { ...payload, clientId: tmpId };
          try {
            if (!live?.connected) throw { transport: true };
            res = await sendOverSocket(live, selectedChat.data._id, body);
          } catch (e) {
            if (!e?.transport) throw e;
            res = await axiosInstance.post(url, body);
          }
        } else {
          res = await axiosInstance.post(url, payload);
        }
      } catch (err) {
        // No answer at all (offline / bad signal): keep the message on screen with a "tap to retry" mark and
        // send it by itself the moment the connection is back — never lose what was typed.
        if (simple && me && selectedChat.type === "direct" && !selectedChat.data?.isSelf && !err?.response) {
          outbox.set(tmpId, { to: selectedChat.data._id, body: { ...payload, clientId: tmpId } });
          set((state) => ({ messages: state.messages.map((m) => (m._id === tmpId ? { ...m, pending: false, failed: true } : m)) }));
          return;
        }
        if (simple) set((state) => ({ messages: state.messages.filter((m) => m._id !== tmpId) }));
        throw err;
      }
      // Replying means I've read their messages: clear the unread badge right away (the server does the same).
      if (selectedChat.type === "direct") {
        set((state) => ({ users: state.users.map((u) => (u._id === selectedChat.data._id && u.unreadCount ? { ...u, unreadCount: 0 } : u)) }));
        emitSeen(selectedChat.data._id);
      }
      if (simple && me) {
        set((state) => {
          // swap the clock copy for the real message — and drop any copy a refresh already brought in
          let used = false;
          const out = [];
          for (const m of state.messages) {
            if (m._id === tmpId || m._id === res.data._id) {
              if (used) continue;
              used = true;
              out.push(res.data);
            } else out.push(m);
          }
          return { messages: out };
        });
      } else {
        set((state) =>
          state.selectedChat?.data?._id === selectedChat.data._id
            ? { messages: [...state.messages, res.data], replyingTo: null }
            : { replyingTo: null }
        );
      }

      // Bump this chat to the top of the sidebar and refresh its preview
      // immediately — don't wait for a refetch.
      if (selectedChat.type === "direct") {
        set((state) => {
          const updated = state.users.map((u) =>
            u._id === selectedChat.data._id ? { ...u, lastMessage: res.data } : u
          );
          updated.sort((a, b) => {
            const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return bt - at;
          });
          return { users: updated };
        });
      } else {
        set((state) => {
          const updated = state.groups.map((g) =>
            g._id === selectedChat.data._id ? { ...g, lastMessage: res.data } : g
          );
          updated.sort((a, b) => {
            const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
            const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
            return bt - at;
          });
          return { groups: updated };
        });
      }
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to send message");
      throw error;
    }
  },

  // Pinning asks "how long?" first (8 hours / 24 hours / 7 days); unpinning is immediate.
  pinPicker: null,
  requestPin: (message) => {
    if (message.pinned && (!message.pinUntil || new Date(message.pinUntil) > new Date())) get().togglePinMessage(message._id);
    else set({ pinPicker: message });
  },
  togglePinMessage: async (messageId, hours) => {
    try {
      const res = await axiosInstance.put(`/messages/pin/${messageId}`, { hours });
      get().applyMessageUpdate(res.data);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update pin");
    }
  },

  // React with an emoji (same emoji again removes it). Optimistic; server is the truth.
  reactToMessage: async (messageId, emoji) => {
    const me = useAuthStore.getState().authUser?._id;
    const before = get().messages.find((m) => m._id === messageId)?.reactions || [];
    const mine = before.find((r) => String(r.user) === String(me));
    const next = before.filter((r) => String(r.user) !== String(me));
    if (emoji && mine?.emoji !== emoji) next.push({ user: me, emoji });
    const setReactions = (reactions) =>
      set((state) => ({ messages: state.messages.map((m) => (m._id === messageId ? { ...m, reactions } : m)) }));
    setReactions(next);
    try {
      const res = await axiosInstance.put(`/messages/react/${messageId}`, { emoji });
      setReactions(res.data.reactions);
    } catch (error) {
      setReactions(before);
      toast.error(error.response?.data?.error || "Couldn't react");
    }
  },

  applyMessageUpdate: (updatedMessage) => {
    set((state) => ({
      messages: state.messages.map((m) => (m._id === updatedMessage._id ? updatedMessage : m)),
    }));
  },

  // mode: "me" removes it only from this device's view; "everyone" clears
  // the content for all participants (sender only), like WhatsApp.
  deleteMessage: async (messageId, mode) => {
    try {
      const res = await axiosInstance.delete(`/messages/${messageId}`, { data: { mode } });
      if (mode === "me") {
        set((state) => ({ messages: state.messages.filter((m) => m._id !== messageId) }));
      } else {
        get().applyMessageUpdate(res.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete message");
    }
  },

  setEditingMessage: (message) => set({ editingMessage: message, replyingTo: null }),
  clearEditingMessage: () => set({ editingMessage: null }),
  editMessage: async (messageId, text) => {
    const res = await axiosInstance.put(`/messages/edit/${messageId}`, { text });
    get().applyEdit(res.data);
    set({ editingMessage: null });
  },
  rsvpEvent: async (messageId, answer) => {
    try {
      const res = await axiosInstance.put(`/messages/event/${messageId}/rsvp`, { answer });
      set((state) => ({ messages: state.messages.map((m) => (m._id === messageId ? { ...m, event: res.data.event } : m)) }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't save your answer");
    }
  },
  votePoll: async (messageId, optionIds) => {
    try {
      const res = await axiosInstance.put(`/messages/poll/${messageId}/vote`, { optionIds });
      set((state) => ({ messages: state.messages.map((m) => (m._id === messageId ? { ...m, poll: res.data.poll } : m)) }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't save your vote");
    }
  },
  openViewOnce: async (messageId) => {
    try {
      const res = await axiosInstance.post(`/messages/view-once/${messageId}`);
      set((state) => ({ messages: state.messages.map((m) => (m._id === messageId ? { ...m, viewOnceOpened: true } : m)) }));
      return res.data.image;
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't open photo");
      set((state) => ({ messages: state.messages.map((m) => (m._id === messageId ? { ...m, viewOnceOpened: true } : m)) }));
      return null;
    }
  },
  applyEdit: ({ _id, text, editedAt }) => {
    const patch = (m) => (m && m._id === _id ? { ...m, text, editedAt } : m);
    set((state) => ({
      messages: state.messages.map(patch),
      users: state.users.map((u) => (u.lastMessage?._id === _id ? { ...u, lastMessage: patch(u.lastMessage) } : u)),
      groups: state.groups.map((g) => (g.lastMessage?._id === _id ? { ...g, lastMessage: patch(g.lastMessage) } : g)),
    }));
  },
  setReplyingTo: (message) => set({ replyingTo: message, editingMessage: null }),
  clearReplyingTo: () => set({ replyingTo: null }),

  toggleStarMessage: async (messageId) => {
    try {
      const res = await axiosInstance.put(`/messages/star/${messageId}`);
      get().applyMessageUpdate(res.data);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update star");
    }
  },

  forwardMessage: async (message, targetChat) => {
    try {
      const url =
        targetChat.type === "direct"
          ? `/messages/send/${targetChat.data._id}`
          : `/groups/${targetChat.data._id}/messages`;
      await axiosInstance.post(url, {
        forwarded: true,
        text: message.text || "",
        image: message.image || undefined,
        file: message.file
          ? { data: message.file.url, name: message.file.name, mimeType: "", size: message.file.size }
          : undefined,
      });
      toast.success("Message forwarded");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to forward message");
    }
  },

  // ---- Group management ----
  createGroup: async ({ name, memberIds, groupPic }) => {
    try {
      const res = await axiosInstance.post("/groups", { name, memberIds, groupPic });
      set((state) => ({ groups: [res.data, ...state.groups] }));
      toast.success("Group created");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to create group");
      throw error;
    }
  },

  // Admin: change the group's name and/or photo ({ name, groupPic } or { removeGroupPic: true }).
  updateGroupInfo: async (groupId, payload) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}`, payload);
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't update the group");
      return false;
    }
  },

  setGroupPermission: async (groupId, key, value) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/permissions`, { [key]: value });
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't change that setting");
    }
  },

  setGroupDisappearing: async (groupId, seconds) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/disappearing`, { seconds });
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't change disappearing messages");
    }
  },

  addMembersToGroup: async (groupId, memberIds) => {
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/members`, { memberIds });
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
      toast.success("Members added");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to add members");
    }
  },

  removeMemberFromGroup: async (groupId, memberId) => {
    try {
      const res = await axiosInstance.delete(`/groups/${groupId}/members/${memberId}`);
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to remove member");
    }
  },

  setGroupAdmin: async (groupId, memberId, admin) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/admins/${memberId}`, { admin });
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? { ...g, ...res.data } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? { type: "group", data: res.data }
            : state.selectedChat,
      }));
      toast.success(admin ? "Made group admin" : "Dismissed as admin");
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't change admin");
    }
  },

  leaveGroup: async (groupId) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      set((state) => ({
        groups: state.groups.filter((g) => g._id !== groupId),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? null
            : state.selectedChat,
      }));
      toast.success("Left group");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to leave group");
    }
  },

  // ---- Typing ----
  emitTyping: () => {
    const socket = useAuthStore.getState().socket;
    const { selectedChat } = get();
    if (!socket || !selectedChat || selectedChat.data?.isSelf) return; // no typing signal to yourself
    if (selectedChat.type === "direct") {
      socket.emit("typing", { toUserId: selectedChat.data._id });
    } else {
      socket.emit("groupTyping", { groupId: selectedChat.data._id });
    }
  },

  // "recording audio…" for the other person in a 1:1 chat
  emitRecording: (on) => {
    const socket = useAuthStore.getState().socket;
    const { selectedChat } = get();
    if (!socket || selectedChat?.type !== "direct") return;
    socket.emit(on ? "recording" : "stopRecording", { toUserId: selectedChat.data._id });
  },

  emitStopTyping: () => {
    const socket = useAuthStore.getState().socket;
    const { selectedChat } = get();
    if (!socket || !selectedChat || selectedChat.data?.isSelf) return;
    if (selectedChat.type === "direct") {
      socket.emit("stopTyping", { toUserId: selectedChat.data._id });
    } else {
      socket.emit("groupStopTyping", { groupId: selectedChat.data._id });
    }
  },

  isSelectedChatTyping: () => {
    const { selectedChat, typingUsers } = get();
    if (!selectedChat) return false;
    const key = selectedChat.type === "direct" ? selectedChat.data._id : `group:${selectedChat.data._id}`;
    const set_ = typingUsers[key];
    return !!set_ && set_.size > 0;
  },

  // ---- Socket wiring (subscribed ONCE for the whole session) ----
  subscribeToSocket: () => {
    if (get().socketSubscribed) return;
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    set({ socketSubscribed: true });

    socket.on("newMessage", (message) => {
      // Tell the server this device really has it -> the sender's double tick.
      if (message?._id && message.senderId !== useAuthStore.getState().authUser?._id) socket.emit("messageReceived", { messageId: message._id });
      const { selectedChat, messages: current } = get();
      const me = useAuthStore.getState().authUser?._id;
      // They replied, so they have read everything I sent them before it (blue ticks).
      const replied = message.senderId !== me && !message.groupId;
      const messages = replied
        ? current.map((m) => (m.senderId === me && m.receiverId === message.senderId && !m.groupId && (!m.seen || !m.delivered) ? { ...m, seen: true, delivered: true } : m))
        : current;
      if (replied) {
        set((st) => ({
          users: st.users.map((u) => (u._id === message.senderId && u.lastMessage?.senderId === me ? { ...u, lastMessage: { ...u.lastMessage, seen: true, delivered: true } } : u)),
        }));
      }
      const isActiveChat =
        selectedChat?.type === "direct" &&
        (message.senderId === selectedChat.data._id || message.receiverId === selectedChat.data._id);

      if (isActiveChat) {
        if (messages.some((m) => m._id === message._id)) return;
        set({ messages: [...messages, message] });
        if (document.visibilityState === "visible") emitSeen(message.senderId);
      } else {
        set((state) => ({
          users: state.users.map((u) =>
            u._id === message.senderId
              ? { ...u, unreadCount: (u.unreadCount || 0) + 1, lastMessage: message }
              : u
          ),
        }));
      }

      if (!isActiveChat || document.visibilityState !== "visible") {
        const sender = get().users.find((u) => u._id === message.senderId);
        notifyIncoming(sender?.fullName || "New message", message);
      }

      // Bump sender to top / refresh preview regardless of active chat
      set((state) => {
        const updated = state.users.map((u) =>
          u._id === message.senderId || u._id === message.receiverId
            ? { ...u, lastMessage: message }
            : u
        );
        updated.sort((a, b) => {
          const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
          const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
          return bt - at;
        });
        return { users: updated };
      });
    });

    socket.on("newGroupMessage", (message) => {
      if (message?._id && message.senderId !== useAuthStore.getState().authUser?._id) socket.emit("messageReceived", { messageId: message._id, groupId: message.groupId });
      const { selectedChat, messages } = get();
      const isActiveChat = selectedChat?.type === "group" && selectedChat.data._id === message.groupId;

      if (isActiveChat) {
        set({ messages: [...messages, message] });
      } else {
        set((state) => ({
          groups: state.groups.map((g) =>
            g._id === message.groupId
              ? { ...g, unreadCount: (g.unreadCount || 0) + 1, lastMessage: message }
              : g
          ),
        }));
      }

      if ((!isActiveChat || document.visibilityState !== "visible") && message.senderId !== useAuthStore.getState().authUser?._id) {
        const group = get().groups.find((g) => g._id === message.groupId);
        notifyIncoming(group?.name || "New group message", message, true);
      }

      set((state) => {
        const updated = state.groups.map((g) =>
          g._id === message.groupId ? { ...g, lastMessage: message } : g
        );
        updated.sort((a, b) => {
          const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
          const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
          return bt - at;
        });
        return { groups: updated };
      });
    });

    socket.on("messagesSeen", ({ by }) => {
      const { selectedChat, messages } = get();
      if (selectedChat?.type === "direct" && selectedChat.data._id === by) {
        set({ messages: messages.map((m) => (m.receiverId === by ? { ...m, seen: true, delivered: true } : m)) });
      }
      // Keep the ticks in the chat list in sync too.
      set((state) => ({
        users: state.users.map((u) =>
          u._id === by && u.lastMessage ? { ...u, lastMessage: { ...u.lastMessage, seen: true, delivered: true } } : u
        ),
      }));
    });

    socket.on("messagesDelivered", ({ by }) => {
      const { selectedChat, messages } = get();
      if (selectedChat?.type === "direct" && selectedChat.data._id === by) {
        set({
          messages: messages.map((m) => (m.receiverId === by ? { ...m, delivered: true } : m)),
        });
      }
      set((state) => ({
        users: state.users.map((u) =>
          u._id === by && u.lastMessage ? { ...u, lastMessage: { ...u.lastMessage, delivered: true } } : u
        ),
      }));
    });

    socket.on("messageEdited", (m) => get().applyEdit(m));
    socket.on("directDisappearing", ({ userId, seconds }) =>
      set((state) => ({ directDisappear: { ...state.directDisappear, [userId]: seconds || 0 } }))
    );
    socket.on("messageEvent", ({ _id, event }) =>
      set((state) => ({ messages: state.messages.map((m) => (m._id === _id ? { ...m, event } : m)) }))
    );
    socket.on("messageLive", ({ _id, liveLocation }) =>
      set((state) => ({ messages: state.messages.map((m) => (m._id === _id ? { ...m, liveLocation } : m)) }))
    );
    socket.on("messagePoll", ({ _id, poll }) =>
      set((state) => ({ messages: state.messages.map((m) => (m._id === _id ? { ...m, poll } : m)) }))
    );
    socket.on("messageViewOnce", ({ _id }) =>
      set((state) => ({ messages: state.messages.map((m) => (m._id === _id ? { ...m, viewOnceOpened: true } : m)) }))
    );

    socket.on("messageReacted", ({ _id, reactions }) => {
      set((state) => ({ messages: state.messages.map((m) => (m._id === _id ? { ...m, reactions } : m)) }));
    });

    socket.on("messagePinned", (message) => {
      get().applyMessageUpdate(message);
    });
    socket.on("messageUnpinned", (message) => {
      get().applyMessageUpdate(message);
    });
    socket.on("messageDeleted", (message) => {
      get().applyMessageUpdate(message);
    });

    socket.on("typing", ({ fromUserId }) => {
      set((state) => {
        const s = new Set(state.typingUsers[fromUserId]);
        s.add(fromUserId);
        return { typingUsers: { ...state.typingUsers, [fromUserId]: s } };
      });
    });
    socket.on("stopTyping", ({ fromUserId }) => {
      set((state) => {
        const rest = { ...state.typingUsers };
        delete rest[fromUserId];
        return { typingUsers: rest };
      });
    });

    const recTimers = {};
    const clearRec = (fromUserId) => {
      clearTimeout(recTimers[fromUserId]);
      set((state) => {
        const rest = { ...state.typingUsers };
        delete rest[`rec:${fromUserId}`];
        return { typingUsers: rest };
      });
    };
    socket.on("recording", ({ fromUserId }) => {
      set((state) => ({ typingUsers: { ...state.typingUsers, [`rec:${fromUserId}`]: new Set([fromUserId]) } }));
      clearTimeout(recTimers[fromUserId]); // sender pings every 5s; if they vanish, stop showing it
      recTimers[fromUserId] = setTimeout(() => clearRec(fromUserId), 9000);
    });
    socket.on("stopRecording", ({ fromUserId }) => clearRec(fromUserId));

    socket.on("groupTyping", ({ fromUserId, groupId }) => {
      set((state) => {
        const key = `group:${groupId}`;
        const s = new Set(state.typingUsers[key]);
        s.add(fromUserId);
        return { typingUsers: { ...state.typingUsers, [key]: s } };
      });
    });
    socket.on("groupStopTyping", ({ fromUserId, groupId }) => {
      set((state) => {
        const key = `group:${groupId}`;
        const s = new Set(state.typingUsers[key]);
        s.delete(fromUserId);
        return { typingUsers: { ...state.typingUsers, [key]: s } };
      });
    });

    // A group member's device received / read messages: update the ticks and
    // the "Message info" lists live.
    socket.on("groupReceipts", ({ groupId, userId, at, kind, messageIds }) => {
      const ids = new Set(messageIds);
      const patch = (m) => {
        if (!ids.has(m._id)) return m;
        const has = (list) => (list || []).some((e) => String(e.user) === String(userId));
        const next = { ...m };
        if (!has(m.deliveredTo)) next.deliveredTo = [...(m.deliveredTo || []), { user: userId, at }];
        if (kind === "seen") {
          if (!has(m.seenLog)) next.seenLog = [...(m.seenLog || []), { user: userId, at }];
          if (!(m.seenBy || []).map(String).includes(String(userId))) next.seenBy = [...(m.seenBy || []), userId];
        }
        return next;
      };
      const open = get().selectedChat?.type === "group" && get().selectedChat.data._id === groupId;
      set((state) => ({
        // the chat-list preview's ticks update even when that group isn't open
        groups: state.groups.map((g) => (g._id === groupId && g.lastMessage ? { ...g, lastMessage: patch(g.lastMessage) } : g)),
        ...(open ? { messages: state.messages.map(patch) } : {}),
      }));
    });

    // Archive list changed on another device (or this one) — keep in sync.
    ["archivedChats", "lockedChats", "pinnedChats", "mutedChats", "markedUnread", "chatLists", "blockedUsers", "privacy"].forEach((field) => {
      socket.on(field, (list) => {
        useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, [field]: list } } : {}));
      });
    });

    // The centred "… turned on disappearing messages" line: shown in the chat and the list, never counted as unread.
    socket.on("systemMessage", (m) => {
      const me = useAuthStore.getState().authUser?._id;
      const peer = m.senderId === me ? m.receiverId : m.senderId;
      set((st) => {
        const active = st.selectedChat?.type === "direct" && st.selectedChat.data._id === peer;
        return {
          messages: active && !st.messages.some((x) => x._id === m._id) ? [...st.messages, m] : st.messages,
          users: st.users.map((u) => (u._id === peer ? { ...u, lastMessage: m } : u)),
        };
      });
    });
    socket.on("directVanish", ({ userId, on }) => set((st) => ({ directVanish: { ...st.directVanish, [userId]: on } })));
    socket.on("vanishCleared", ({ ids }) => {
      const gone = new Set(ids || []);
      set((st) => ({ messages: st.messages.filter((m) => !gone.has(m._id)) }));
    });

    socket.on("visibilityChanged", () => get().getUsers());
    // Owner: someone asked to see more people. Person: the owner answered.
    socket.on("accessRequest", ({ fullName }) => toast(`${fullName || "Someone"} wants to see more people — open Settings → Who can see whom`, { icon: "🔔", duration: 6000 }));
    socket.on("accessDecision", ({ status }) => toast(status === "approved" ? "You can now see more people" : "Your request was declined", { icon: status === "approved" ? "✅" : "❌" })); // the owner changed who I can see

    socket.on("userNote", ({ userId, note }) => {
      set((st) => ({ users: st.users.map((u) => (u._id === userId ? { ...u, note } : u)) }));
      useAuthStore.setState((st) => (st.authUser && String(st.authUser._id) === String(userId) ? { authUser: { ...st.authUser, note } } : {}));
    });

    socket.on("statusLiked", ({ user }) => {
      toast(`${user?.fullName || "Someone"} liked your status`, { icon: "❤️" });
    });

    socket.on("groupCreated", (group) => {
      set((state) => {
        if (state.groups.some((g) => g._id === group._id)) return {};
        return { groups: [group, ...state.groups] };
      });
      toast.success(`Added to group "${group.name}"`);
    });

    socket.on("groupUpdated", (group) => {
      set((state) => ({
        groups: state.groups.map((g) => (g._id === group._id ? { ...g, ...group } : g)),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === group._id
            ? { type: "group", data: group }
            : state.selectedChat,
      }));
    });

    socket.on("removedFromGroup", ({ groupId }) => {
      set((state) => ({
        groups: state.groups.filter((g) => g._id !== groupId),
        selectedChat:
          state.selectedChat?.type === "group" && state.selectedChat.data._id === groupId
            ? null
            : state.selectedChat,
      }));
      toast("You were removed from a group", { icon: "👋" });
    });
  },

  unsubscribeFromSocket: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    [
      "newMessage",
      "newGroupMessage",
      "messagesSeen",
      "messagesDelivered",
      "systemMessage",
      "accessRequest",
      "accessDecision",
      "messagePinned",
      "messageUnpinned",
      "messageDeleted",
      "typing",
      "stopTyping",
      "groupTyping",
      "groupStopTyping",
      "groupCreated",
      "statusLiked",
      "groupUpdated",
      "removedFromGroup",
      "archivedChats",
      "lockedChats",
      "pinnedChats",
      "mutedChats",
      "markedUnread",
      "chatLists",
      "blockedUsers",
      "privacy",
      "groupReceipts",
      "messageReacted",
      "messageEdited",
      "messagePoll",
      "messageEvent",
      "messageLive",
      "messageViewOnce",
    ].forEach((event) => socket.off(event));
    set({ socketSubscribed: false });
  },
}));
