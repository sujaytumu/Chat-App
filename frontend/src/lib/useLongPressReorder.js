import { useCallback, useRef } from "react";

// Hold an item for a moment, then drag it onto another item to change the order (like moving an app on the home screen).
//
//   const gridRef = useLongPressReorder((from, to) => setList((l) => moveItem(l, from, to)));
//   <div ref={gridRef}> {list.map((x, i) => <div key={x.id} data-sort-idx={i}>…</div>)} </div>
//
// - every draggable item carries data-sort-idx="<its index>"; something inside an item that must not start a drag
//   (a remove button) carries data-no-sort
// - a quick tap or a normal scroll is left alone: the drag only starts after the hold
// - near the top / bottom edge of a scrolling list the list scrolls by itself
// - onMove(from, to) is called when the finger lets go on another item
export const moveItem = (list, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const c = [...list];
  const [x] = c.splice(from, 1);
  c.splice(to, 0, x);
  return c;
};

const scrollParent = (el) => {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) return n;
  }
  return null;
};

export function useLongPressReorder(onMove, { enabled = true, holdMs = 380, selector = "[data-sort-idx]" } = {}) {
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const cleanup = useRef(null);

  return useCallback(
    (root) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!root || !enabled) return;

      let st = null; // { el, from, sx, sy, timer, active, over, scroller, scrollStart, lx, ly, raf }
      let suppressClick = false;
      const prevCallout = root.style.webkitTouchCallout;
      const prevSelect = root.style.userSelect;
      root.style.webkitTouchCallout = "none";
      root.style.userSelect = "none";

      const mark = (el, on) => {
        if (!el) return;
        el.style.outline = on ? "2px solid #21C063" : "";
        el.style.outlineOffset = on ? "-2px" : "";
      };

      const place = () => {
        if (!st?.active) return;
        const scrolled = st.scroller ? st.scroller.scrollTop - st.scrollStart : 0;
        st.el.style.transform = `translate(${st.lx - st.sx}px, ${st.ly - st.sy + scrolled}px) scale(1.06)`;
        const under = document.elementFromPoint(st.lx, st.ly)?.closest(selector);
        const over = under && root.contains(under) && under !== st.el ? under : null;
        if (over !== st.over) {
          mark(st.over, false);
          mark(over, true);
          st.over = over;
        }
      };

      const autoScroll = () => {
        if (!st?.active) return;
        const sc = st.scroller;
        if (sc) {
          const r = sc.getBoundingClientRect();
          const edge = 70;
          let v = 0;
          if (st.ly < r.top + edge) v = -Math.ceil((r.top + edge - st.ly) / 5);
          else if (st.ly > r.bottom - edge) v = Math.ceil((st.ly - (r.bottom - edge)) / 5);
          if (v) {
            sc.scrollTop += v;
            place();
          }
        }
        st.raf = requestAnimationFrame(autoScroll);
      };

      const activate = () => {
        if (!st) return;
        st.active = true;
        try { navigator.vibrate?.(18); } catch { /* not supported */ }
        const s = st.el.style;
        s.transition = "none";
        s.position = "relative";
        s.zIndex = "60";
        s.pointerEvents = "none"; // so the item under the finger can be found
        s.boxShadow = "0 10px 28px rgba(0,0,0,.55)";
        s.opacity = ".92";
        st.scroller = scrollParent(st.el);
        st.scrollStart = st.scroller ? st.scroller.scrollTop : 0;
        place();
        st.raf = requestAnimationFrame(autoScroll);
      };

      const reset = () => {
        if (!st) return;
        clearTimeout(st.timer);
        cancelAnimationFrame(st.raf);
        const s = st.el.style;
        s.transition = s.position = s.zIndex = s.pointerEvents = s.boxShadow = s.opacity = s.transform = "";
        mark(st.over, false);
      };

      const begin = (target, x, y) => {
        if (st) return;
        if (target.closest?.("[data-no-sort]")) return;
        const el = target.closest?.(selector);
        if (!el || !root.contains(el)) return;
        const from = Number(el.getAttribute("data-sort-idx"));
        if (!Number.isInteger(from)) return;
        st = { el, from, sx: x, sy: y, lx: x, ly: y, active: false, over: null, timer: null, raf: 0, scroller: null, scrollStart: 0 };
        st.timer = setTimeout(activate, holdMs);
      };

      const move = (x, y) => {
        if (!st) return false;
        st.lx = x;
        st.ly = y;
        if (!st.active) {
          if (Math.hypot(x - st.sx, y - st.sy) > 10) {
            clearTimeout(st.timer); // the finger moved before the hold: it is a scroll, not a drag
            st = null;
          }
          return false;
        }
        place();
        return true;
      };

      const end = (cancelled) => {
        if (!st) return;
        const { active, from, over } = st;
        reset();
        st = null;
        if (!active) return;
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 450);
        if (!cancelled && over) {
          const to = Number(over.getAttribute("data-sort-idx"));
          if (Number.isInteger(to) && to !== from) moveRef.current?.(from, to);
        }
      };

      const onTouchStart = (e) => {
        if (e.touches.length !== 1) return end(true);
        begin(e.target, e.touches[0].clientX, e.touches[0].clientY);
      };
      const onTouchMove = (e) => {
        const t = e.touches[0];
        if (t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); // dragging: the page must not scroll
      };
      const onTouchEnd = () => end(false);
      const onTouchCancel = () => end(true);
      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        begin(e.target, e.clientX, e.clientY);
      };
      const onMouseMove = (e) => {
        if (move(e.clientX, e.clientY)) e.preventDefault();
      };
      const onMouseUp = () => end(false);
      const onContextMenu = (e) => {
        if (st) e.preventDefault(); // a long press must not open the browser's "save image" menu
      };
      const onClickCapture = (e) => {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      root.addEventListener("touchstart", onTouchStart, { passive: true });
      root.addEventListener("touchmove", onTouchMove, { passive: false });
      root.addEventListener("touchend", onTouchEnd);
      root.addEventListener("touchcancel", onTouchCancel);
      root.addEventListener("mousedown", onMouseDown);
      root.addEventListener("contextmenu", onContextMenu);
      root.addEventListener("click", onClickCapture, true);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      cleanup.current = () => {
        end(true);
        root.style.webkitTouchCallout = prevCallout;
        root.style.userSelect = prevSelect;
        root.removeEventListener("touchstart", onTouchStart);
        root.removeEventListener("touchmove", onTouchMove);
        root.removeEventListener("touchend", onTouchEnd);
        root.removeEventListener("touchcancel", onTouchCancel);
        root.removeEventListener("mousedown", onMouseDown);
        root.removeEventListener("contextmenu", onContextMenu);
        root.removeEventListener("click", onClickCapture, true);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [enabled, holdMs, selector]
  );
}
