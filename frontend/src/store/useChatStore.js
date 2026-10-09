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

function notifyIncoming(senderName, message, isGroup = false) {
  // Muted chats stay silent (the unread badge still counts).
  const muteKey = isGroup ? `g:${message.groupId}` : `d:${message.senderId}`;
  if (useAuthStore.getState().authUser?.mutedChats?.includes(muteKey)) return;
  // Phone with the app in the background: the system notification (from Web
  // Push) carries the sound — don't also try to play one from a frozen page.
  if (shouldLeaveToSystemAlert()) return;
  playNotificationSound(isGroup);
  const buzz = vibrationPattern(isGroup ? "group" : "message");
  if (buzz) navigator.vibrate?.(buzz);
  // With Web Push active the service worker shows the notification itself.
  if (isPushActive()) return;
  const body = message.image ? "📷 Photo" : message.text || "New message";
  showDesktopNotification(isGroup ? `${senderName}` : senderName, {
    body: isGroup && message.text ? message.text : body,
    icon: "/icon-v2-192.png",
    tag: isGroup ? `group-${message.groupId}` : `dm-${message.senderId}`,
  });
}

const PAGE_SIZE = 80; // messages fetched per page (newest first, older on demand)
const msgCache = new Map(); // chatKey -> last known messages (instant re-open)
const chatKeyOf = (chat) => `${chat.type === "group" ? "g" : "d"}:${chat.data._id}`;
const FLAG_API = {
  archivedChats: { url: "/messages/archive", body: (v) => ({ archived: v }), on: "Chat archived", off: "Chat unarchived", icon: "🗄️" },
  pinnedChats: { url: "/messages/pin-chat", body: (v) => ({ value: v }), on: "Chat pinned", off: "Chat unpinned", icon: "📌" },
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

  messages: [],
  hasMoreMessages: false,
  isLoadingOlder: false,
  isFetchingMessages: false,
  pendingJump: null, // { id } — a search result to scroll to once its chat/messages are loaded
  chatSearchOpen: false,
  isMessagesLoading: false,
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
  setChatFlag: async (field, chat, value, { silent = false } = {}) => {
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
  setChatMuted: (chat, muted, opts) => get().setChatFlag("mutedChats", chat, muted, opts),

  // Delete a chat for me (the other side keeps theirs).
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
    if (!chat) {
      set({ selectedChat: null, messages: [], hasMoreMessages: false, chatSearchOpen: false, pendingJump: null });
      return;
    }
    // Re-opening a chat is instant: show what we last had (memory, then disk)
    // right away and refresh from the server in the background.
    const key = chatKeyOf(chat);
    const userId = useAuthStore.getState().authUser?._id;
    const cached = msgCache.get(key) || readChatCache(userId, `msgs-${key}`) || [];
    set({ selectedChat: chat, messages: cached, hasMoreMessages: false, chatSearchOpen: false });
    get().getMessages();
  },

  setChatSearchOpen: (open) => set({ chatSearchOpen: open }),

  // Search messages: everywhere, or inside one chat when `chat` is given.
  searchMessages: async (q, chat) => {
    const params = { q };
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
      const merged = older.length ? [...older, ...fresh] : fresh;
      set((state) => ({
        messages: merged,
        hasMoreMessages: older.length ? state.hasMoreMessages : fresh.length >= PAGE_SIZE,
      }));

      const key = chatKeyOf(chat);
      msgCache.set(key, fresh);
      const userId = useAuthStore.getState().authUser?._id;
      setTimeout(() => writeChatCache(userId, `msgs-${key}`, fresh.slice(-40)), 0);

      if (chat.type === "direct") {
        // Mark as seen + clear unread badge locally
        axiosInstance.put(`/messages/seen/${chat.data._id}`).catch(() => {});
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

  sendMessage: async (messageData) => {
    const { selectedChat, messages, replyingTo } = get();
    if (!selectedChat) return;
    try {
      const url =
        selectedChat.type === "direct"
          ? `/messages/send/${selectedChat.data._id}`
          : `/groups/${selectedChat.data._id}/messages`;
      const payload = replyingTo ? { ...messageData, replyTo: replyingTo._id } : messageData;
      const res = await axiosInstance.post(url, payload);
      set({ messages: [...messages, res.data], replyingTo: null });

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
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to send message");
      throw error;
    }
  },

  togglePinMessage: async (messageId) => {
    try {
      const res = await axiosInstance.put(`/messages/pin/${messageId}`);
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

  setReplyingTo: (message) => set({ replyingTo: message }),
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
    if (!socket || !selectedChat) return;
    if (selectedChat.type === "direct") {
      socket.emit("typing", { toUserId: selectedChat.data._id });
    } else {
      socket.emit("groupTyping", { groupId: selectedChat.data._id });
    }
  },

  emitStopTyping: () => {
    const socket = useAuthStore.getState().socket;
    const { selectedChat } = get();
    if (!socket || !selectedChat) return;
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
      const { selectedChat, messages } = get();
      const isActiveChat =
        selectedChat?.type === "direct" &&
        (message.senderId === selectedChat.data._id || message.receiverId === selectedChat.data._id);

      if (isActiveChat) {
        set({ messages: [...messages, message] });
        if (document.visibilityState === "visible") {
          axiosInstance.put(`/messages/seen/${message.senderId}`).catch(() => {});
        }
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
        set({ messages: messages.map((m) => ({ ...m, seen: true, delivered: true })) });
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
      const { selectedChat } = get();
      if (selectedChat?.type !== "group" || selectedChat.data._id !== groupId) return;
      const ids = new Set(messageIds);
      set((state) => ({
        messages: state.messages.map((m) => {
          if (!ids.has(m._id)) return m;
          const has = (list) => (list || []).some((e) => String(e.user) === String(userId));
          const next = { ...m };
          if (!has(m.deliveredTo)) next.deliveredTo = [...(m.deliveredTo || []), { user: userId, at }];
          if (kind === "seen") {
            if (!has(m.seenLog)) next.seenLog = [...(m.seenLog || []), { user: userId, at }];
            if (!(m.seenBy || []).map(String).includes(String(userId))) next.seenBy = [...(m.seenBy || []), userId];
          }
          return next;
        }),
      }));
    });

    // Archive list changed on another device (or this one) — keep in sync.
    ["archivedChats", "pinnedChats", "mutedChats"].forEach((field) => {
      socket.on(field, (list) => {
        useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, [field]: list } } : {}));
      });
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
        groups: state.groups.map((g) => (g._id === group._id ? group : g)),
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
      "messagePinned",
      "messageUnpinned",
      "messageDeleted",
      "typing",
      "stopTyping",
      "groupTyping",
      "groupStopTyping",
      "groupCreated",
      "groupUpdated",
      "removedFromGroup",
      "archivedChats",
      "pinnedChats",
      "mutedChats",
      "groupReceipts",
      "messageReacted",
    ].forEach((event) => socket.off(event));
    set({ socketSubscribed: false });
  },
}));
