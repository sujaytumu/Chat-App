import { useEffect } from "react";
import MainNav from "./MainNav";

// Shared shell for the main app screens (Chats / Updates / Calls) — puts the
// persistent WhatsApp-style nav (rail on desktop, bottom bar on mobile)
// alongside whichever page is active.
//
// The shell is pinned to the *visible* viewport. In a phone browser the visible
// height changes as the address bar slides away and as the keyboard opens, and
// 100vh / min-h-screen don't follow it — that mismatch made the page scrollable
// (scrolling the chat header off the top) and exposed a strip of background at
// the bottom. We track window.visualViewport and size the shell to exactly
// that, and lock the document so only the message list scrolls.
const MainLayout = ({ children }) => {
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      if (vv && vv.scale > 1.01) return; // pinch-zoomed: leave the layout alone
      const height = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
      // iOS scrolls the page when the keyboard opens — keep it pinned to the top.
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    document.documentElement.classList.add("app-locked");
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      document.documentElement.classList.remove("app-locked");
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 bg-[#0B141A] flex overflow-hidden"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <MainNav />
      <div className="flex-1 min-w-0 flex overflow-hidden">{children}</div>
    </div>
  );
};

export default MainLayout;
