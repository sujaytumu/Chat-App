import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
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
// Phone tabs in WhatsApp's order. Swiping the screen left/right moves between
// them, just like tapping the bottom bar.
const TABS = ["/", "/status", "/calls", "/profile"];
let slideFrom = null; // "left" | "right": which side the next tab slides in from

// Don't treat a drag as a tab swipe when it starts on something that scrolls
// sideways (status row, chip row), a text field, a video or a slider.
const blocksSwipe = (el) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches?.("input,textarea,select,video,canvas,[data-no-swipe]")) return true;
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
};

const MainLayout = ({ children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const hasOpenChat = useChatStore((s) => !!s.selectedChat);
  const touch = useRef(null);
  const tabIndex = TABS.indexOf(pathname);
  const swipeable = tabIndex !== -1 && !(pathname === "/" && hasOpenChat);
  const slide = useRef(slideFrom);
  slideFrom = null;

  const onTouchStart = (e) => {
    if (!swipeable || e.touches.length !== 1 || window.innerWidth >= 1024 || blocksSwipe(e.target)) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - s.t > 800) return;
    const next = tabIndex + (dx < 0 ? 1 : -1);
    if (next < 0 || next >= TABS.length) return;
    slideFrom = dx < 0 ? "right" : "left";
    navigate(TABS[next]);
  };

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
      className="fixed inset-x-0 top-0 bg-wa-bg flex overflow-hidden"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <MainNav />
      <div
        className={`flex-1 min-w-0 flex overflow-hidden ${slide.current ? `tab-slide-from-${slide.current}` : ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
