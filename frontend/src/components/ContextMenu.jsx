import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Laptop-sized screens use WhatsApp Web's pattern (right-click or the little hover arrow opens a dropdown);
// phones keep long-press + the bar on top.
export const isDesktopNow = () => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches;

// A floating menu like WhatsApp Web's: plain rows with an icon, rounded card, closes on outside click / Esc / scroll.
//  x, y   - where it opens (a right-click point, or the corner of the arrow that was clicked)
//  align  - "left": x is the menu's left edge, "right": x is its right edge
//  top    - optional node shown above the card (the emoji reactions)
//  items  - [{ label, icon, onClick, hidden, divider, keepOpen }]
const ContextMenu = ({ x, y, align = "left", top = null, items, onClose }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "right" ? x - w : x;
    let topPx = y;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (topPx + h > vh - 8) topPx = Math.max(8, y - h - 8); // not enough room below: open upwards
    setPos({ left, top: topPx });
  }, [x, y, align]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    // scrolling the chat / list underneath closes it (the menu would otherwise float over the wrong message)
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        className="absolute flex flex-col items-start gap-2"
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      >
        {top}
        <div role="menu" className="min-w-[220px] rounded-[14px] bg-wa-pop text-wa-text py-2 overflow-hidden" style={{ boxShadow: "0 12px 40px -8px rgb(0 0 0 / .45), 0 0 0 1px rgb(128 128 128 / .12)" }}>
          {items
            .filter((it) => !it.hidden)
            .map((it, i) => {
              const Icon = it.icon;
              return (
                <div key={`${it.label}-${i}`}>
                  {it.divider && <div className="my-1.5 h-px bg-white/10" />}
                  <button
                    role="menuitem"
                    onClick={() => {
                      if (!it.keepOpen) onClose(); // keepOpen: the caller swaps this menu for something else itself
                      it.onClick?.();
                    }}
                    className="w-full flex items-center gap-4 px-5 py-2.5 text-[14.5px] text-left hover:bg-wa-surface active:bg-wa-hover"
                  >
                    {Icon ? <Icon size={20} className="text-wa-icon shrink-0" /> : <span className="w-5 shrink-0" />}
                    <span className="truncate">{it.label}</span>
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>,
    document.body
  );
};

// WhatsApp's confirm dialog: title, short text, stacked rounded outline buttons on the right.
//  actions - [{ label, onClick, danger }]; a Cancel is always added last.
export const ConfirmDialog = ({ title, body, actions, onClose }) =>
  createPortal(
    <div className="fixed inset-0 z-[310] bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[22rem] rounded-2xl bg-wa-pop text-wa-text p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-medium">{title}</h3>
        {body && <p className="text-[14px] text-wa-muted mt-2 leading-snug">{body}</p>}
        <div className="flex flex-col items-end gap-2.5 mt-6">
          {[...actions, { label: "Cancel", onClick: onClose }].map((a) => (
            <button
              key={a.label}
              onClick={() => {
                onClose();
                a.onClick?.();
              }}
              className={`h-10 px-5 rounded-full border text-[14px] font-medium hover:bg-wa-surface ${a.danger ? "border-[#F15C6D]/50 text-[#F15C6D]" : "border-white/15 text-[#00A884]"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );

export default ContextMenu;
