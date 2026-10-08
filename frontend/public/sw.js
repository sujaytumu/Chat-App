// Service worker for Talkies — background push notifications (they fire even
// if the site/tab/app isn't open) and installability.

const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test((self.navigator && self.navigator.userAgent) || "");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Talkies", body: event.data.text() };
  }

  const { title, body, icon, tag, data, isCall, actions } = payload;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // The app is open and being looked at: it already plays its own sound /
      // shows the incoming-call screen, so a system notification on top would
      // just double-alert (and ring twice).
      if (windows.some((c) => c.visibilityState === "visible" && c.focused)) return;

      // Desktop browsers keep a hidden/unfocused page alive, and that page plays
      // the person's chosen tone itself — so show the notification silently to
      // avoid two sounds. Phones freeze background pages, so there the system
      // notification must carry the sound (and vibration).
      const pageHandlesSound = !IS_MOBILE && windows.length > 0;

      await self.registration.showNotification(title || "Talkies", {
        body,
        icon: icon || "/icon-v2-192.png",
        badge: "/icon-v2-192.png",
        tag,
        data,
        renotify: true,
        silent: pageHandlesSound,
        // Incoming calls: stay on screen until acted on, buzz, and offer
        // Answer / Decline right on the notification.
        requireInteraction: !!isCall,
        vibrate: isCall ? [700, 400, 700, 400, 700, 400, 700] : [200, 100, 200],
        actions: isCall && Array.isArray(actions) ? actions : undefined,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "";

  // "Decline" works without opening the app: tell the server to reject the call.
  if (action === "decline") {
    event.waitUntil(
      fetch("/api/calls/decline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerId: data.callerId }),
      }).catch(() => {})
    );
    return;
  }

  // Open (or focus) the app and tell it what was tapped: "answer" a call, or
  // just open the chat the notification was about.
  const message = { type: "notification-click", action: action || "open", data };

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = windows.find((c) => c.url.startsWith(self.location.origin));
      if (target) {
        try {
          await target.focus();
        } catch {
          // focusing can be refused; still deliver the message below
        }
        target.postMessage(message);
        return;
      }

      // App isn't open: launch it with the intent in the URL (the app reads it
      // on start). A held call is delivered to it as soon as it connects.
      const params = new URLSearchParams();
      if (data.chatId) {
        params.set("chat", data.chatId);
        params.set("type", data.chatType || "direct");
      }
      if (action === "answer" && data.callerId) params.set("answer", data.callerId);
      const query = params.toString();
      if (self.clients.openWindow) {
        await self.clients.openWindow(query ? `/?${query}` : data.url || "/");
      }
    })()
  );
});
