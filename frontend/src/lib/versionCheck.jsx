import { useSyncExternalStore, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";

// Keeps every device on the newest build. When a newer build exists, ONE big popup asks the person to
// update (never during a call); otherwise the app just runs normally. The Update button stays until the person taps it and the new build is running.

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;
const RELOAD_LOG_KEY = "talkies-auto-reloads";
const CHECK_EVERY_MS = 2 * 60 * 1000;

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

// The "Update" button stays until the app is really running the newer build: the waiting build is remembered
// on this device, so it survives reloads, the app being closed, and a failed or half-applied update.
const PENDING_KEY = "talkies-pending-entry";
const readPending = () => {
  try { return localStorage.getItem(PENDING_KEY) || ""; } catch { return ""; }
};
const writePending = (v) => {
  try { v ? localStorage.setItem(PENDING_KEY, v) : localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
};
let updateReady = (() => {
  const p = readPending();
  const mine = typeof document !== "undefined" ? currentEntry() : null;
  if (p && mine && p !== mine) return true;
  if (p && mine && p === mine) writePending("");
  return false;
})();
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
  if (!latest) return;
  if (latest === mine) {
    // really on the newest build now
    writePending("");
    setReady(false);
    return;
  }
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  writePending(latest);
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
    check();
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

// The same Update button on EVERY screen (Reels, Feed, Post, Search, Updates, Calls, You), floating above the
// bottom bar. Chats keeps its own pill at the top of the list, and it stays away from calls and open chats.
export function GlobalUpdatePill() {
  const ready = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => updateReady);
  const busyCall = useCallStore((s) => s.callStatus !== "idle");
  const chatOpen = useChatStore((s) => !!s.selectedChat);
  const { pathname } = useLocation();
  const [updating, setUpdating] = useState(false);
  if (!ready || busyCall || pathname === "/" || chatOpen || pathname === "/login" || pathname === "/signup") return null;
  return (
    <button
      disabled={updating}
      onClick={() => {
        setUpdating(true);
        applyUpdate();
      }}
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(84px+env(safe-area-inset-bottom))] lg:bottom-6 z-[95] h-10 pl-3.5 pr-4 rounded-full bg-[#25D366] text-[#0b141a] text-[14px] font-semibold shadow-[0_6px_20px_rgba(0,0,0,.45)] flex items-center gap-2 disabled:opacity-70 active:scale-95 transition-transform"
    >
      <RefreshCw size={16} className={updating ? "animate-spin" : ""} />
      {updating ? "Updating…" : "Update available"}
    </button>
  );
}

// Settings → Help: check right now and show the update popup if there is a newer build.
export async function checkForUpdateNow() {
  try {
    const latest = await latestEntry();
    const current = currentEntry();
    if (!latest || !current) return "unknown";
    if (latest === current) {
      writePending("");
      setReady(false);
      return "latest";
    }
    writePending(latest);
    setReady(true);
    return "updating";
  } catch {
    return "unknown";
  }
}

export const currentBuildId = () => currentEntry()?.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] || "dev";
