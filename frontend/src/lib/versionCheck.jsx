import { useSyncExternalStore, useState } from "react";
import { useCallStore } from "../store/useCallStore";

// Keeps every device on the newest build. When a newer build exists, ONE big popup asks the person to
// update (never during a call); otherwise the app just runs normally. It installs quietly the next time the app returns to the front.

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;
const RELOAD_LOG_KEY = "talkies-auto-reloads";
const CHECK_EVERY_MS = 5 * 60 * 1000;

function currentEntry() {
  const el = document.querySelector('script[type="module"][src*="assets/index-"]');
  return el?.getAttribute("src")?.match(ENTRY_RE)?.[0] || null;
}

async function latestEntry() {
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  const html = await res.text();
  const entry = html.match(ENTRY_RE)?.[0] || null;
  // Put the fresh page into the app-shell cache first, so the reload that follows
  // opens the NEW build instead of the old saved copy.
  if (entry && entry !== currentEntry()) {
    try {
      const cache = await caches.open("talkies-shell-v1");
      await cache.put("/index.html", new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    } catch {
      /* no cache access — the reload still works */
    }
  }
  return entry;
}

const inCall = () => useCallStore.getState().callStatus !== "idle";

let updateReady = false;
const listeners = new Set();
const setReady = (v) => {
  if (updateReady === v) return;
  updateReady = v;
  listeners.forEach((l) => l());
};

// Refresh the saved app copy first, so the reload opens the NEW build and never a half-old one.
export async function applyUpdate() {
  try {
    await latestEntry();
  } catch {
    /* offline or slow — the reload below still tries */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

async function check() {
  const mine = currentEntry();
  if (!mine) return; // dev server — nothing hashed to compare
  let latest;
  try {
    latest = await latestEntry();
  } catch {
    return; // offline
  }
  if (!latest || latest === mine) return;
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  setReady(true);
}

export function startVersionWatcher() {
  check();
  let hiddenAt = 0;
  const onVisible = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    check().then(() => {
      // Back after being away for a while and a new version is waiting: install it quietly now.
      if (updateReady && hiddenAt && Date.now() - hiddenAt > 15000 && !inCall()) {
        let last = 0;
        try { last = Number(sessionStorage.getItem("talkies-auto-update") || 0); } catch { /* ignore */ }
        if (Date.now() - last > 60000) {
          try { sessionStorage.setItem("talkies-auto-update", String(Date.now())); } catch { /* ignore */ }
          applyUpdate();
        }
      }
    });
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", check);
  const id = setInterval(check, CHECK_EVERY_MS);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", check);
    clearInterval(id);
  };
}

// A small "Update" pill for the top of the Chats page: casual, never inside a chat or a call.
export function UpdateButton() {
  const ready = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => updateReady);
  const busyCall = useCallStore((s) => s.callStatus !== "idle");
  const [updating, setUpdating] = useState(false);
  if (!ready || busyCall) return null;
  return (
    <button
      disabled={updating}
      onClick={() => {
        setUpdating(true);
        applyUpdate();
      }}
      className="h-8 px-3.5 mr-1 rounded-full bg-[#25D366] text-[#0b141a] text-[13px] font-semibold disabled:opacity-70 active:scale-95 transition-transform"
    >
      {updating ? "Updating…" : "Update"}
    </button>
  );
}

// Settings → Help: check right now and show the update popup if there is a newer build.
export async function checkForUpdateNow() {
  try {
    const latest = await latestEntry();
    const current = currentEntry();
    if (!latest || !current) return "unknown";
    if (latest === current) return "latest";
    setReady(true);
    return "updating";
  } catch {
    return "unknown";
  }
}

export const currentBuildId = () => currentEntry()?.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] || "dev";
