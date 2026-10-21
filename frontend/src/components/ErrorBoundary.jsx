import { Component } from "react";

export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("talkies-chunk-reload") || 0);
    if (Date.now() - last < 30000) return; // never loop
    sessionStorage.setItem("talkies-chunk-reload", String(Date.now()));
  } catch {
    /* ignore */
  }
  (async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* ignore */
    }
    window.location.reload();
  })();
}
if (typeof window !== "undefined") window.addEventListener("vite:preloadError", () => reloadForNewVersion());

// Catches render errors so a crash in one screen shows a message instead of
// unmounting the entire app (blank page).
class ErrorBoundary extends Component {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error || "") };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info?.componentStack);
    // After a new version goes live, a phone that was away still holds the OLD page, whose screen files no
    // longer exist: opening a screen then fails to load. Fetch the new version once, automatically.
    const msg = String(error?.message || error || "");
    if (/dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|Failed to fetch dynamically/i.test(msg)) {
      reloadForNewVersion();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.silent) return null;
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center bg-wa-bg min-h-screen">
        <p className="text-wa-text font-medium">Something went wrong on this screen.</p>
        {<p className="text-[11px] text-wa-muted max-w-xs break-words">{this.state.message.slice(0, 160)}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 rounded-lg bg-[#00A884] text-white text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-4 py-2 rounded-lg bg-white/10 text-wa-text text-sm"
          >
            Go to chats
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
