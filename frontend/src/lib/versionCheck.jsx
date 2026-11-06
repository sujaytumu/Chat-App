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

// Quiet automatic update: when the app is opened (or comes back after being away) and a newer build waits,
// switch to it by itself - but never during a call or while something is being typed, and at most once every
// 10 minutes so a failing update can never loop.
const AUTO_KEY = "talkies-auto-applied-at";
function typingNow() {
  const el = document.activeElement;
  if (!el) return false;
  const editable = el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes(el.type));
  return !!editable && String(el.value ?? el.textContent ?? "").trim().length > 0;
}
function autoApply() {
  if (!updateReady || inCall() || typingNow()) return false;
  try {
    const last = Number(sessionStorage.getItem(AUTO_KEY) || 0);
    if (Date.now() - last < 10 * 60 * 1000) return false;
    sessionStorage.setItem(AUTO_KEY, String(Date.now()));
  } catch { /* no storage: the popup still asks */ }
  applyUpdate();
  return true;
}

async function check() {
  const mine = currentEntry();
  if (!mine) return false; // dev server — nothing hashed to compare
  let latest;
  try {
    latest = await latestEntry();
  } catch {
    return false; // offline
  }
  if (!latest) return false;
  if (latest === mine) {
    // really on the newest build now
    writePending("");
    setReady(false);
    return false;
  }
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  writePending(latest);
  setReady(true);
  return true;
}

export function startVersionWatcher() {
  check().then((found) => found && autoApply()); // just opened: take the new version straight away
  let hiddenAt = 0;
  const onVisible = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const awayFor = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    check().then((found) => found && awayFor > 20000 && autoApply()); // back after a while
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

// The update popup: shown once when a newer build is ready (never during a call). "Later" hides it for this
// build; the Update button/pill stays available.
let dismissedFor = "";
export function UpdatePopup() {
  const ready = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => updateReady);
  const busyCall = useCallStore((s) => s.callStatus !== "idle");
  const [updating, setUpdating] = useState(false);
  const [, bump] = useState(0);
  const pending = readPending();
  if (!ready || busyCall || !pending || dismissedFor === pending) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label="Update available">
      <div className="w-full max-w-sm rounded-2xl bg-wa-panel p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[#25D366]/15">
          <RefreshCw size={26} className={`text-[#25D366] ${updating ? "animate-spin" : ""}`} />
        </div>
        <h2 className="text-lg font-semibold text-wa-text">New version available</h2>
        <p className="mt-1 text-[13.5px] text-wa-muted">Update Talkies to get the latest features and fixes. It only takes a moment.</p>
        <button
          disabled={updating}
          onClick={() => { setUpdating(true); applyUpdate(); }}
          className="mt-5 h-11 w-full rounded-full bg-[#25D366] font-semibold text-[#0b141a] disabled:opacity-70 active:scale-95 transition-transform"
        >
          {updating ? "Updating…" : "Update now"}
        </button>
        <button disabled={updating} onClick={() => { dismissedFor = pending; bump((n) => n + 1); }} className="mt-2 h-10 w-full rounded-full text-[13.5px] text-wa-muted hover:bg-wa-pop">
          Later
        </button>
      </div>
    </div>
  );
}
