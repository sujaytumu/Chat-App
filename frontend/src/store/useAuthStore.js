import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useChatStore } from "./useChatStore";
import { useCallStore } from "./useCallStore";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");

      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully");

      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("error in update profile:", error);
      toast.error(error.response.data.message);
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    const socket = io(BASE_URL, {
      query: {
        userId: authUser._id,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socket.connect();

    set({ socket: socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // Fires on the very first connect AND every automatic reconnect after a
    // dropped connection. Any messages sent while disconnected never arrived
    // via socket, so silently resync the sidebar and the open conversation —
    // otherwise they'd only show up once the user manually switches chats.
    socket.on("connect", () => {
      useChatStore.getState().getUsers();
      useChatStore.getState().getGroups();
      const selectedChat = useChatStore.getState().selectedChat;
      if (selectedChat) {
        useChatStore.getState().getMessages();
      }
    });

    // Wire up chat-related socket listeners (messages, typing, groups) once
    useChatStore.getState().subscribeToSocket();
    useCallStore.getState().subscribeToCallSocket();

    // Mobile browsers pause/throttle JS timers (including Socket.IO's own
    // reconnection backoff) while a tab is backgrounded, to save battery.
    // Coming back to a stale, still-disconnected socket that's quietly
    // waiting on a throttled timer — rather than reconnecting immediately —
    // is very likely why calls/messages sometimes don't arrive even though
    // the person is "online": their tab was backgrounded, the connection
    // died, and nothing nudged it to reconnect the moment they came back.
    // Force an immediate reconnect attempt as soon as the tab is visible
    // again, instead of waiting on that backoff timer to catch up.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && socket && !socket.connected) {
        socket.connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
  },
  disconnectSocket: () => {
    useChatStore.getState().unsubscribeFromSocket();
    useCallStore.getState().unsubscribeFromCallSocket();
    useCallStore.getState().resetCall();
    if (get().socket?.connected) get().socket.disconnect();
    set({ socket: null });
  },
}));
