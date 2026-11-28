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
    // The page follows the finger while you swipe (like WhatsApp), then slides away and the next tab slides in;
    // let go early and it springs back.
    let drag = null; // { dir, t0 } once the swipe is clearly sideways
    const reset = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
      el.style.willChange = "";
    };
    const start = (e) => {
      drag = null;
      if (e.touches.length !== 1 || window.innerWidth >= 1024 || blocks(e.target)) { s = null; return; }
      s = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    };
    const move = (e) => {
      if (!s || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!drag) {
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        drag = { dir: dx < 0 ? 1 : -1 };
        el.style.transition = "none";
        el.style.willChange = "transform, opacity";
      }
      const to = TAB_ORDER.indexOf(pathname) + drag.dir;
      const edge = !(to >= 0 && to < TAB_ORDER.length); // no tab that way: it only gives a little, like a rubber band
      const w = el.clientWidth || window.innerWidth;
      const x = Math.max(-w, Math.min(w, dx * (edge ? 0.22 : 0.9)));
      el.style.transform = `translate3d(${x}px,0,0)`;
      el.style.opacity = String(1 - Math.min(0.45, (Math.abs(x) / w) * 0.9));
    };
    const end = (e) => {
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t); // px per ms
      s = null;
      const next = TAB_ORDER.indexOf(pathname) + (dx < 0 ? 1 : -1);
      const go = Math.abs(dx) >= 70 || (Math.abs(dx) >= 28 && speed > 0.45);
      if (!go || Math.abs(dx) < Math.abs(dy) * 1.6 || !(next >= 0 && next < TAB_ORDER.length)) {
        if (drag) { // spring back
          el.style.transition = "transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s";
          el.style.transform = "translate3d(0,0,0)";
          el.style.opacity = "1";
          setTimeout(reset, 230);
        }
        drag = null;
        return;
      }
      const w = el.clientWidth || window.innerWidth;
      drag = null;
      el.style.transition = "transform .13s ease-out, opacity .13s ease-out";
      el.style.transform = `translate3d(${dx < 0 ? -w : w}px,0,0)`;
      el.style.opacity = "0.4";
      setTimeout(() => {
        goTab(navigate, pathname, TAB_ORDER[next]);
        setTimeout(reset, 60);
      }, 120);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchcancel", () => { s = null; if (drag) { drag = null; reset(); } }, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchmove", move);
      reset();
    };
  }, [ref, navigate, pathname]);
}
