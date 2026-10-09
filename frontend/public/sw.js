// Service worker for Talkies — background push notifications (they fire even
// if the site/tab/app isn't open) and installability.

const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test((self.navigator && self.navigator.userAgent) || "");

// ---- App-shell caching: instant open, even when the server is asleep ----------
// Hashed files under /assets/ never change, so they're served from the device
// (no network at all after the first visit). The HTML page is fetched fresh
// every time, but if the server doesn't answer within a couple of seconds
// (cold start / bad signal) the last good copy is used so the app opens
// immediately and then catches up — instead of a blank screen.
const SHELL_CACHE = "talkies-shell-v1";
const ASSET_CACHE = "talkies-assets-v1";
const SHELL_TIMEOUT_MS = 2500;
const MAX_ASSETS = 120;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("talkies-") && n !== SHELL_CACHE && n !== ASSET_CACHE).map((n) => caches.delete(n))
      );
      // keep the asset cache from growing forever across deploys
      const assets = await caches.open(ASSET_CACHE);
      const keys = await assets.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => assets.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match("/index.html");
  if (!cached) return fetch(request);

  const network = fetch(request).then((res) => {
    if (!res.ok) throw new Error("bad shell response");
    cache.put("/index.html", res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), SHELL_TIMEOUT_MS));
  return Promise.race([network, timeout]).catch(() => cached);
}

async function assetResponse(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // The server answers unknown paths with the HTML page — never cache that as a script.
  const type = res.headers.get("content-type") || "";
  if (res.ok && !type.includes("text/html")) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/") || url.pathname === "/sw.js") return;
  if (req.cache === "no-store" || url.searchParams.has("v")) return; // the app's "is there a new version?" check

  if (req.mode === "navigate") {
    event.respondWith(shellResponse(req));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(assetResponse(req));
  }
});

// ---- Push subscription renewal -------------------------------------------------
// Browsers occasionally rotate a push subscription. Without this the device
// quietly stops getting notifications until the app is opened again.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // will be re-subscribed next time the app opens
      }
    })()
  );
});

// Notification preferences mirrored from Settings → Notifications (vibration
// patterns, silent groups). Stored in a cache the page can write to.
async function readPrefs() {
  try {
    const cache = await caches.open("prefs-v1");
    const res = await cache.match("/__prefs");
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

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
      const prefs = await readPrefs();
      const isGroupMsg = !isCall && data && data.chatType === "group";
      let vibrate = isCall ? [700, 400, 700, 400, 700, 400, 700] : [200, 100, 200];
      if (prefs) {
        const chosen = isCall ? prefs.call : isGroupMsg ? prefs.group : prefs.message;
        vibrate = chosen === null || chosen === undefined ? [] : chosen;
      }

      await self.registration.showNotification(title || "Talkies", {
        body,
        icon: icon || "/icon-v2-192.png",
        badge: "/icon-v2-192.png",
        tag,
        data,
        renotify: true,
        silent: pageHandlesSound || (isGroupMsg && !!(prefs && prefs.groupSilent)),
        // Incoming calls: stay on screen until acted on, buzz, and offer
        // Answer / Decline right on the notification.
        requireInteraction: !!isCall,
        vibrate,
        actions: isCall && Array.isArray(actions) ? actions : undefined,
      });

      // The message reached this device: tell the server so the sender gets
      // the double tick ("delivered") even though the app is closed.
      if (data && data.messageId) {
        await fetch("/api/messages/ack-delivered", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: data.messageId }),
        }).catch(() => {});
      }
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
