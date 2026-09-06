import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { requestNotificationPermission } from "../lib/notificationSound";

const BASE_TITLE = "Talkies";

// Invisible component: requests notification permission once, and keeps the
// browser tab title showing the total unread count (e.g. "(3) Talkies"),
// similar to WhatsApp Web.
const NotificationManager = () => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const totalUnread =
      users.reduce((sum, u) => sum + (u.unreadCount || 0), 0) +
      groups.reduce((sum, g) => sum + (g.unreadCount || 0), 0);

    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) ${BASE_TITLE}` : BASE_TITLE;

    return () => {
      document.title = BASE_TITLE;
    };
  }, [users, groups]);

  return null;
};

export default NotificationManager;
