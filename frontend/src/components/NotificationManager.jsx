import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { startNotificationActionListener } from "../lib/notificationActions";
import { useChatStore } from "../store/useChatStore";
import { requestNotificationPermission, registerPushSubscription, primeAudio } from "../lib/notificationSound";
import { loadCustomTone } from "../lib/soundSettings";
import { axiosInstance } from "../lib/axios";

const BASE_TITLE = "Talkies";

// Invisible component: requests notification permission, subscribes this
// device to background Web Push (so notifications arrive even with the app
// fully closed), and keeps the browser tab title showing the total unread
// count (e.g. "(3) Talkies"), similar to WhatsApp Web.
const NotificationManager = () => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const navigate = useNavigate();

  // Taps on message / call notifications (Answer, open chat).
  useEffect(() => startNotificationActionListener(() => navigate("/")), [navigate]);

  useEffect(() => {
    // Warm the cache of any sounds the person picked in Settings so the very
    // first ring / message tone plays without a load delay.
    loadCustomTone("call");
    loadCustomTone("message");

    const trySubscribe = async () => {
      const result = await requestNotificationPermission();
      if (result === "granted") {
        await registerPushSubscription(axiosInstance);
      }
    };
    trySubscribe();

    // Some browsers only honor a permission request that follows a genuine
    // user gesture, and Web Audio stays fully locked until one occurs too.
    // Keep priming on every interaction (cheap no-op once already unlocked)
    // rather than just the first one, since a single early attempt can
    // sometimes fail silently (e.g. fired before full page interactivity).
    const onGesture = () => {
      primeAudio();
      trySubscribe();
    };
    // iOS Safari does NOT treat "touchstart" as an audio-unlocking gesture —
    // only "touchend" / "click" count — which is a big reason ringtones were
    // silent on iPhones. Listen for every kind of tap.
    const events = ["click", "keydown", "touchstart", "touchend", "pointerup"];
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture));
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
