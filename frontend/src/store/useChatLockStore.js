import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";

// Chat lock: chats the person locked stay hidden behind a PIN. `unlocked` lives
// only in memory, so closing the folder, switching away for 30 s, reloading or
// logging out locks everything again. The PIN itself is checked by the server.
const AUTO_RELOCK_MS = 30000;
const keyOf = (chat) => `${chat.type === "group" ? "g" : "d"}:${chat.data._id}`;
const errMsg = (e, fallback) => e.response?.data?.error || e.response?.data?.message || fallback;

export const isChatLocked = (chat) =>
  !!chat && (useAuthStore.getState().authUser?.lockedChats || []).includes(keyOf(chat));

const setLocked = (lockedChats) =>
  useAuthStore.setState((st) => (st.authUser ? { authUser: { ...st.authUser, lockedChats } } : {}));

export const useChatLockStore = create((set, get) => ({
  unlocked: false,
  hasPin: null,
  modal: null, // { mode: "enter" | "create", title, subtitle, submit(pin) -> true | error text }

  reset: () => set({ unlocked: false, hasPin: null, modal: null }),
  closeModal: () => set({ modal: null }),

  loadStatus: async () => {
    try {
      const { data } = await axiosInstance.get("/messages/lock/status");
      set({ hasPin: data.hasPin });
      return data.hasPin;
    } catch {
      return get().hasPin;
    }
  },

  relock: () => {
    if (!get().unlocked) return;
    set({ unlocked: false });
    // A locked chat that is open on screen closes with it
    if (isChatLocked(useChatStore.getState().selectedChat)) useChatStore.getState().setSelectedChat(null);
  },

  // Ask for the PIN (unless already unlocked), then run onDone.
  requestUnlock: (onDone) => {
    if (get().unlocked) return onDone?.();
    set({
      modal: {
        mode: "enter",
        title: "Locked chats",
        subtitle: "Enter your PIN to continue",
        submit: async (pin) => {
          try {
            await axiosInstance.post("/messages/lock/verify", { pin });
            set({ unlocked: true, modal: null });
            onDone?.();
            return true;
          } catch (e) {
            return errMsg(e, "Wrong PIN");
          }
        },
      },
    });
  },

  // Lock a chat. First time ever: create the PIN, then lock.
  requestLock: async (chat, onDone) => {
    const has = get().hasPin ?? (await get().loadStatus());
    const doLock = async () => {
      try {
        const { data } = await axiosInstance.put("/messages/lock", {
          chatType: chat.type,
          chatId: chat.data._id,
          locked: true,
        });
        setLocked(data.lockedChats);
        set({ unlocked: false });
        toast("Chat locked", { icon: "🔒" });
        onDone?.();
      } catch (e) {
        toast.error(errMsg(e, "Couldn't lock chat"));
      }
    };
    if (has) return doLock();
    set({
      modal: {
        mode: "create",
        title: "Create a PIN",
        subtitle: "Choose 4 to 6 digits. You'll need it to open locked chats.",
        submit: async (pin) => {
          try {
            await axiosInstance.post("/messages/lock/pin", { pin });
            set({ hasPin: true, modal: null });
            await doLock();
            return true;
          } catch (e) {
            return errMsg(e, "Couldn't save PIN");
          }
        },
      },
    });
  },

  // Take the lock off one chat for good (needs the PIN).
  requestRemoveLock: (chat, onDone) =>
    set({
      modal: {
        mode: "enter",
        title: "Remove chat lock",
        subtitle: "Enter your PIN to unlock this chat",
        submit: async (pin) => {
          try {
            const { data } = await axiosInstance.put("/messages/lock", {
              chatType: chat.type,
              chatId: chat.data._id,
              locked: false,
              pin,
            });
            setLocked(data.lockedChats);
            set({ modal: null });
            toast("Chat unlocked", { icon: "🔓" });
            onDone?.();
            return true;
          } catch (e) {
            return errMsg(e, "Wrong PIN");
          }
        },
      },
    }),

  // Forgot the PIN: the account password removes it and unlocks every chat.
  resetWithPassword: async (password) => {
    try {
      await axiosInstance.post("/messages/lock/reset", { password });
      setLocked([]);
      set({ hasPin: false, unlocked: false, modal: null });
      toast.success("Chat lock removed — all chats are unlocked");
      return true;
    } catch (e) {
      return errMsg(e, "Wrong password");
    }
  },
}));

// Leaving the app for a while locks everything again.
if (typeof document !== "undefined") {
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AUTO_RELOCK_MS) useChatLockStore.getState().relock();
  });
}
