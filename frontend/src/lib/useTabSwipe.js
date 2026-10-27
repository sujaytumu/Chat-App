import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { goTab } from "./tabNav";

// The phone tabs in bottom-bar order. Swiping left/right always goes to the neighbour in this list.
export const TAB_ORDER = ["/", "/status", "/post", "/reels", "/explore", "/calls", "/profile"];

// Swipe left/right on a full-screen page (Reels, Search) to move to the next/previous tab.
// Drags that start on something that scrolls sideways, a text field or a slider are left alone.
export function useTabSwipe(ref) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let s = null;
    const blocks = (t) => {
      for (let n = t; n && n !== el.parentElement; n = n.parentElement) {
        if (n.matches?.("input,textarea,select,canvas,iframe,[data-no-swipe]")) return true;
        if (n !== el) {
          const st = getComputedStyle(n);
          if (st.position === "fixed" && parseInt(st.zIndex, 10) > 60) return true; // a pop-up sheet (comments, menus) is open
        }
        if (n.scrollWidth > n.clientWidth + 2) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
      }
      return false;
    };
    const start = (e) => {
      if (e.touches.length !== 1 || window.innerWidth >= 1024 || blocks(e.target)) { s = null; return; }
      s = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const end = (e) => {
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      s = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const next = TAB_ORDER.indexOf(pathname) + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < TAB_ORDER.length) goTab(navigate, pathname, TAB_ORDER[next]);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
  }, [ref, navigate, pathname]);
}
