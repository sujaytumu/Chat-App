import { ChevronUp, Check } from "lucide-react";
import { useEffect } from "react";

// Pull-up indicator for disappearing messages in a 1:1 chat. It only exists while you drag (and for a moment
// after you let go); nothing about disappearing messages is left in the chat itself.
//
// It sits in the space the chat leaves behind as it is pulled up. Everything is driven by transforms, so it
// follows the finger without layout jank:
//  - the ring fills exactly as far as you have pulled (no easing lag),
//  - at the threshold the circle fills solid and gives one short buzz: "let go now",
//  - after you let go a tick pops in and the whole thing slides away. No endless spinner.

const SIZE = 46;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const REACH = 132; // tallest the indicator ever gets (px)

export const VanishPullIndicator = ({ px, pull, busy, turningOn }) => {
  const ready = pull >= 1;
  const p = Math.min(pull, 1);

  // one short buzz the moment the pull is far enough
  useEffect(() => {
    if (!ready || busy) return;
    try { navigator.vibrate?.(14); } catch { /* not available */ }
  }, [ready, busy]);

  const filled = ready || busy;
  const verb = turningOn ? "on" : "off";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center"
      style={{
        height: REACH,
        // the top edge of this box rises with the pull; the chat area clips whatever is still below the bottom
        transform: `translateY(${Math.max(REACH - px, 0)}px)`,
        transition: busy ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none",
        willChange: "transform",
      }}
      aria-live="polite"
      aria-label={busy ? `Disappearing messages ${verb}` : `Release to turn ${verb} disappearing messages`}
    >
      <div
        className="mt-3.5 relative flex items-center justify-center rounded-full"
        style={{
          width: SIZE,
          height: SIZE,
          opacity: busy ? 1 : Math.min(1, p * 2.2),
          transform: `scale(${busy ? 1 : 0.7 + p * 0.3})`,
          background: filled ? "#fff" : "rgba(255,255,255,0.14)",
          backdropFilter: "blur(6px)",
          transition: "background 160ms ease, transform 160ms ease",
        }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={filled ? "#fff" : "rgba(255,255,255,0.95)"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (filled ? 1 : p))}
          />
        </svg>
        {busy ? (
          <Check size={24} strokeWidth={3} className="relative text-[#0B141A] vanish-pop" />
        ) : (
          <ChevronUp size={24} strokeWidth={2.6} className="relative" style={{ color: ready ? "#0B141A" : "#fff", transition: "color 160ms" }} />
        )}
      </div>
      <span
        className="mt-2 text-white text-[12px] font-medium leading-none drop-shadow"
        style={{ opacity: ready && !busy ? 1 : 0, transition: "opacity 140ms" }}
      >
        Release to turn {verb}
      </span>
    </div>
  );
};
