import { useSyncExternalStore, useState } from "react";
import { useCallStore } from "../store/useCallStore";

// Keeps every device on the newest build. When a newer build exists, ONE big popup asks the person to
// update (never during a call); otherwise the app just runs normally. Nothing reloads by itself.

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
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
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

// The big "update available" popup. Shown only when a newer build exists and no call is on.
export function UpdatePopup() {
  const ready = useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => updateReady);
  const busyCall = useCallStore((s) => s.callStatus !== "idle");
  const [updating, setUpdating] = useState(false);
  if (!ready || (busyCall && !updating)) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/70">
      <div className="w-full max-w-sm rounded-3xl bg-wa-pop text-wa-text p-7 text-center shadow-2xl">
        <div className="mx-auto size-20 rounded-[22px] flex items-center justify-center text-4xl" style={{ background: "linear-gradient(160deg,#0A7A67,#25D366)" }}>
          ⬆️
        </div>
        <h2 className="mt-5 text-[22px] font-semibold">Update available</h2>
        <p className="mt-2 text-[14.5px] text-wa-muted">A new version of Talkies is ready with the latest features and fixes.</p>
        <button
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            applyUpdate();
          }}
          className="mt-6 w-full h-12 rounded-full bg-[#25D366] text-[#0b141a] text-[16px] font-semibold disabled:opacity-70"
        >
          {updating ? "Updating…" : "Update now"}
        </button>
      </div>
    </div>
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
