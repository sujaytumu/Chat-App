import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { requestNotificationPermission, registerPushSubscription } from "../lib/notificationSound";
import { axiosInstance } from "../lib/axios";

const BASE_TITLE = "Talkies";

// Invisible component: requests notification permission, subscribes this
// device to background Web Push (so notifications arrive even with the app
// fully closed), and keeps the browser tab title showing the total unread
// count (e.g. "(3) Talkies"), similar to WhatsApp Web.
const NotificationManager = () => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);

  useEffect(() => {
    const trySubscribe = async () => {
      const result = await requestNotificationPermission();
      if (result === "granted") {
        await registerPushSubscription(axiosInstance);
      }
    };
    trySubscribe();

    // Some browsers only honor a permission request that follows a genuine
    // user gesture — retry once on the user's first click/keypress just in case.
    const retry = () => {
      trySubscribe();
      window.removeEventListener("click", retry);
      window.removeEventListener("keydown", retry);
    };
    window.addEventListener("click", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("click", retry);
      window.removeEventListener("keydown", retry);
    };
  }, []);

  useEffect(() => {
    const totalUnread =
      users.reduce((sum, u) => sum + (u.unreadCount || 0), 0) +
      groups.reduce((sum, g) => sum + (g.unreadCount || 0), 0);

    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) ${BASE_TITLE}` : BASE_TITLE;

    if (navigator.setAppBadge) {
      if (totalUnread > 0) navigator.setAppBadge(totalUnread).catch(() => {});
      else navigator.clearAppBadge?.().catch(() => {});
    }

    return () => {
      document.title = BASE_TITLE;
    };
  }, [users, groups]);

  return null;
};

export default NotificationManager;
