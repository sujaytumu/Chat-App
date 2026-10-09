import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import MainNav from "./MainNav";
import { goTab } from "../lib/tabNav";

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

// The neighbouring tab is rendered next to the current one while you drag, so
// the pages move together under your finger (and stop wherever you stop).
const PEEK = {
  "/": lazy(() => import("../pages/HomePage")),
  "/status": lazy(() => import("../pages/StatusPage")),
  "/calls": lazy(() => import("../pages/CallsPage")),
  "/profile": lazy(() => import("../pages/ProfilePage")),
};

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
  const tabIndex = TABS.indexOf(pathname);
  const swipeable = tabIndex !== -1 && !(pathname === "/" && hasOpenChat);
  const track = useRef(null);
  const drag = useRef(null);
  const [peek, setPeek] = useState(null); // index of the neighbour tab being revealed

  const setX = (x, animate) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = animate ? "transform 220ms cubic-bezier(.2,.8,.2,1)" : "none";
    el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
  };

  // New page is in place: put everything back at rest.
  useLayoutEffect(() => {
    drag.current = null;
    setPeek(null);
    setX(0, false);
  }, [pathname]);

  const onTouchStart = (e) => {
    if (!swipeable || e.touches.length !== 1 || window.innerWidth >= 1024 || blocksSwipe(e.target)) {
      drag.current = null;
      return;
    }
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, t: Date.now(), lastX: t.clientX, lastT: Date.now(), v: 0, locked: false, dx: 0, w: window.innerWidth, busy: false };
  };
  const onTouchMove = (e) => {
    const d = drag.current;
    if (!d || d.busy) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // a vertical scroll
        return;
      }
      d.locked = true;
    }
    const now = Date.now();
    if (now > d.lastT) d.v = (t.clientX - d.lastX) / (now - d.lastT);
    d.lastX = t.clientX;
    d.lastT = now;
    const next = tabIndex + (dx < 0 ? 1 : -1);
    const exists = next >= 0 && next < TABS.length;
    d.dx = exists ? dx : dx * 0.25; // edge: rubber-band
    if (exists) setPeek((p) => (p === next ? p : next));
    else setPeek(null);
    setX(d.dx, false);
  };
  const onTouchEnd = () => {
    const d = drag.current;
    if (!d || !d.locked) {
      drag.current = null;
      return;
    }
    const dir = d.dx < 0 ? 1 : -1;
    const next = tabIndex + dir;
    const exists = next >= 0 && next < TABS.length;
    const flung = Math.abs(d.v) > 0.5 && Math.sign(d.v) === Math.sign(d.dx);
    if (exists && (Math.abs(d.dx) > d.w * 0.33 || flung)) {
      d.busy = true;
      setX(-dir * d.w, true);
      setTimeout(() => goTab(navigate, pathname, TABS[next]), 220);
    } else {
      setX(0, true);
      setTimeout(() => {
        if (!drag.current?.busy) setPeek(null);
      }, 230);
      drag.current = null;
    }
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
        className="flex-1 min-w-0 overflow-hidden relative"
        style={{ touchAction: swipeable ? "pan-y" : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div ref={track} className="relative h-full w-full flex will-change-transform">
          {children}
          {peek !== null && (
            <div
              className="absolute top-0 h-full w-full flex bg-wa-bg pointer-events-none"
              style={{ left: peek > tabIndex ? "100%" : "-100%" }}
            >
              <Suspense fallback={null}>
                {(() => {
                  const Peek = PEEK[TABS[peek]];
                  return <Peek />;
                })()}
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
