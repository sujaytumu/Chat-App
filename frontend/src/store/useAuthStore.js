import { create } from "zustand";
import { clearChatCache } from "../lib/chatCache";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useChatStore } from "./useChatStore";
import { useCallStore } from "./useCallStore";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

// Last signed-in user, remembered on this device. Lets the app open straight
// into the chat list (instead of a spinner while a sleeping server wakes up)
// and verify the session in the background. Wiped on logout (clearChatCache
// removes every "talkies-cache-*" key) and whenever the server says the
// session is no longer valid.
const AUTH_CACHE_KEY = "talkies-cache-auth";
const readCachedAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "null");
  } catch {
    return null;
  }
};
const cachedAuthUser = readCachedAuth();

export const useAuthStore = create((set, get) => ({
  authUser: cachedAuthUser,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: !cachedAuthUser,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    // Known user from last time: connect the realtime socket right away,
    // in parallel with verifying the session.
    if (get().authUser) get().connectSocket();
    try {
      const res = await axiosInstance.get("/auth/check");

      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in checkAuth:", error);
      const status = error.response?.status;
      // Only a real "not signed in" answer signs the person out. A slow/asleep
      // server or no network must not kick them out of a cached session.
      if (!get().authUser || status === 401 || status === 404) {
        set({ authUser: null });
        get().disconnectSocket();
      }
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
      clearChatCache();
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
    if (!authUser || get().socket) return; // socket.io reconnects by itself — never open a second one

    const socket = io(BASE_URL, {
      withCredentials: true, // the signed login cookie is what proves who you are
      // WebSocket straight away (polling only as a fallback): skips the slow
      // HTTP-polling handshake + upgrade, so realtime is up much sooner.
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socket.connect();

    set({ socket: socket });

    // The server only accepts sockets that carry a valid login cookie. If it
    // says no, find out whether the session really ended (-> signed out) or
    // the cookie just didn't ride along this time (-> retry once).
    let authRetried = false;
    socket.on("connect", () => {
      authRetried = false;
    });
    socket.on("connect_error", async (err) => {
      if (err?.message !== "unauthorized") return;
      try {
        await axiosInstance.get("/auth/check");
        if (!authRetried) {
          authRetried = true;
          setTimeout(() => socket.connect(), 1000);
        }
      } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 404) {
          get().disconnectSocket();
          set({ authUser: null });
        }
      }
    });

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
    get().socket?.disconnect();
    set({ socket: null });
  },
}));

// Keep the on-device copy of the signed-in user current (login, profile edit,
// archive changes…) from one place.
useAuthStore.subscribe((state, prev) => {
  if (state.authUser === prev.authUser) return;
  try {
    if (state.authUser) localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state.authUser));
    else localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // storage unavailable — caching is only an optimisation
  }
});
