import { useCallback, useRef } from "react";

// Remembers how far a list was scrolled, so coming back to a screen (from a
// sub-page, a chat, another tab) lands exactly where you left it instead of at
// the top. Pages load their content asynchronously, so the position is
// re-applied as the content grows, until you touch the list yourself.
//
//   <div ref={useScrollMemory("calls")} className="overflow-y-auto">
const saved = new Map();

export function useScrollMemory(key) {
  const cleanup = useRef(null);
  return useCallback(
    (el) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!el) return;
      let userTouched = false;
      let applying = false;
      const target = saved.get(key) || 0;
      const apply = () => {
        if (userTouched || !target) return;
        applying = true;
        el.scrollTop = target;
        requestAnimationFrame(() => (applying = false));
        if (Math.abs(el.scrollTop - target) < 2) stop();
      };
      const onScroll = () => {
        if (!applying) saved.set(key, el.scrollTop);
      };
      const onUser = () => {
        userTouched = true;
        stop();
      };
      let ro = null;
      let timer = null;
      function stop() {
        ro?.disconnect();
        clearTimeout(timer);
      }
      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("touchstart", onUser, { passive: true });
      el.addEventListener("wheel", onUser, { passive: true });
      apply();
      if (target && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(apply);
        [...el.children].forEach((c) => ro.observe(c));
        timer = setTimeout(stop, 4000);
      }
      cleanup.current = () => {
        saved.set(key, el.scrollTop || saved.get(key) || 0);
        stop();
        el.removeEventListener("scroll", onScroll);
        el.removeEventListener("touchstart", onUser);
        el.removeEventListener("wheel", onUser);
      };
    },
    [key]
  );
}
