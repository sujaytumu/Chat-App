import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { playNotificationSound, showDesktopNotification } from "../lib/notificationSound";

function notifyIncoming(senderName, message, isGroup = false) {
  playNotificationSound();
  const body = message.image ? "📷 Photo" : message.text || "New message";
  showDesktopNotification(isGroup ? `${senderName}` : senderName, {
    body: isGroup && message.text ? message.text : body,
    icon: "/whatsapp-icon.jpg",
    tag: isGroup ? `group-${message.groupId}` : `dm-${message.senderId}`,
  });
}

export const useChatStore = create((set, get) => ({
  // Sidebar data
  users: [],
  groups: [],
  isUsersLoading: false,
  isGroupsLoading: false,

  // Active conversation: { type: "direct" | "group", data: user|group }
  selectedChat: null,

  messages: [],
  isMessagesLoading: false,

  // userId (direct) / groupId (group) -> Set of typing userIds
  typingUsers: {},

  socketSubscribed: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getGroups: async () => {
    set({ isGroupsLoading: true });
    try {
      const res = await axiosInstance.get("/groups");
      set({ groups: res.data });
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load groups");
    } finally {
      set({ isGroupsLoading: false });
    }
  },

  setSelectedChat: (chat) => {
    set({ selectedChat: chat, messages: [] });
    if (!chat) return;
    get().getMessages();
  },

  getMessages: async () => {
    const { selectedChat } = get();
    if (!selectedChat) return;
    set({ isMessagesLoading: true });
    try {
      if (selectedChat.type === "direct") {
        const res = await axiosInstance.get(`/messages/${selectedChat.data._id}`);
        set({ messages: res.data });
        // Mark as seen + clear unread badge locally
        axiosInstance.put(`/messages/seen/${selectedChat.data._id}`).catch(() => {});
        set((state) => ({
          users: state.users.map((u) =>
            u._id === selectedChat.data._id ? { ...u, unreadCount: 0 } : u
          ),
        }));
      } else {
        const res = await axiosInstance.get(`/groups/${selectedChat.data._id}/messages`);
        set({ messages: res.data });
        set((state) => ({
          groups: state.groups.map((g) =>
            g._id === selectedChat.data._id ? { ...g, unreadCount: 0 } : g
          ),
        }));
      }
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedChat, messages } = get();
    if (!selectedChat) return;
    try {
      const url =
        selectedChat.type === "direct"
          ? `/messages/send/${selectedChat.data._id}`
          : `/groups/${selectedChat.data._id}/messages`;
      const res = await axiosInstance.post(url, messageData);
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to send message");
      throw error;
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
        set({ messages: messages.map((m) => ({ ...m, seen: true })) });
      }
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
      "typing",
      "stopTyping",
      "groupTyping",
      "groupStopTyping",
      "groupCreated",
      "groupUpdated",
      "removedFromGroup",
    ].forEach((event) => socket.off(event));
    set({ socketSubscribed: false });
  },
}));
