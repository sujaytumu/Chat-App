// Service worker for Talkies — enables background push notifications
// (fires even if the site/tab isn't open) and basic installability.

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

  const { title, body, icon, tag, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "Talkies", {
      body,
      icon: icon || "/icon-v2-192.png",
      badge: "/icon-v2-192.png",
      tag,
      data,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
