import toast from "react-hot-toast";
import { useCallStore } from "../store/useCallStore";

// Keeps every device on the newest build.
//
// The app shell is a single hashed entry script (assets/index-<hash>.js). If a
// browser/phone/installed app is still running (or was handed) an older copy,
// the UI looks "old" until someone reloads. This compares the entry script this
// page is running with the one the server is serving *right now* (fetched with
// no-store) and moves to the new one:
//   - just opened the app (first seconds)  -> reload straight away, silently
//   - been open a while                    -> ask first, and apply when the
//                                             tab is hidden and no call is on

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;
const RELOAD_LOG_KEY = "talkies-auto-reloads";
const FRESH_PAGE_MS = 20_000;
const CHECK_EVERY_MS = 5 * 60 * 1000;

function currentEntry() {
  const el = document.querySelector('script[type="module"][src*="assets/index-"]');
  return el?.getAttribute("src")?.match(ENTRY_RE)?.[0] || null;
}

async function latestEntry() {
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(ENTRY_RE)?.[0] || null;
}

// Guard against a reload loop (e.g. a stale replica still serving the old
// HTML): at most 2 automatic reloads in 10 minutes.
function canAutoReload() {
  try {
    const now = Date.now();
    const log = JSON.parse(sessionStorage.getItem(RELOAD_LOG_KEY) || "[]").filter((t) => now - t < 10 * 60 * 1000);
    if (log.length >= 2) return false;
    log.push(now);
    sessionStorage.setItem(RELOAD_LOG_KEY, JSON.stringify(log));
    return true;
  } catch {
    return true;
  }
}

const inCall = () => useCallStore.getState().callStatus !== "idle";

function reloadNow() {
  if (canAutoReload()) window.location.reload();
}

let updateReady = false;

function offerUpdate() {
  updateReady = true;
  toast(
    (t) => (
      <span className="flex items-center gap-3">
        New version available
        <button
          className="px-3 py-1 rounded-full bg-white text-wa-bg text-sm font-semibold"
          onClick={() => {
            toast.dismiss(t.id);
            window.location.reload();
          }}
        >
          Update
        </button>
      </span>
    ),
    { id: "app-update", duration: Infinity, icon: "⬆️" }
  );
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

  // Also refresh the service worker so notifications use the new code.
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});

  if (performance.now() < FRESH_PAGE_MS && !inCall()) {
    reloadNow();
  } else if (!updateReady) {
    offerUpdate();
  }
}

export function startVersionWatcher() {
  check();

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      check();
    } else if (updateReady && !inCall()) {
      reloadNow(); // they've left the tab — a safe moment to switch builds
    }
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

// Settings → Help: check right now and move to the newest build if there is one.
export async function checkForUpdateNow() {
  try {
    const latest = await latestEntry();
    const current = currentEntry();
    if (!latest || !current) return "unknown";
    if (latest === current) return "latest";
    window.location.reload();
    return "updating";
  } catch {
    return "unknown";
  }
}

export const currentBuildId = () => currentEntry()?.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] || "dev";
