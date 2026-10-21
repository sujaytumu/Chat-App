import { ChevronUp } from "lucide-react";

// Instagram-style Vanish mode visuals for a 1:1 chat.
//  - <VanishPullIndicator>: shown while you drag up past the last message. A ring fills with the
//    pull (the "loading" symbol), the arrow inside rotates a half-turn, and once it is switching the
//    ring spins until the server confirms.
//  - <VanishBottomHint>: the small "Swipe up to turn on/off Vanish mode" line under the last message.

const R = 15;
const C = 2 * Math.PI * R;

// Sits in the space the chat leaves behind as it is pulled up: the circle grows and fills with the pull; once the
// pull is far enough the arrow flips and the circle spins freely — let go and Vanish mode switches.
export const VanishPullIndicator = ({ px, pull, busy, turningOn }) => {
  const ready = busy || pull >= 1;
  const label = busy
    ? `Turning ${turningOn ? "on" : "off"} Vanish mode…`
    : ready
      ? `Release to turn ${turningOn ? "on" : "off"} Vanish mode`
      : `Keep swiping up to turn ${turningOn ? "on" : "off"} Vanish mode`;
  const scale = busy ? 1 : 0.45 + Math.min(pull, 1) * 0.55;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center justify-center gap-2 overflow-hidden"
      style={{ height: px, opacity: busy ? 1 : Math.min(1, pull * 1.6), transition: busy ? "height 200ms ease" : undefined }}
      aria-live="polite"
    >
      <div className="relative size-11 flex items-center justify-center" style={{ transform: `scale(${scale})` }}>
        <svg viewBox="0 0 36 36" className={`absolute inset-0 size-full ${ready ? "animate-spin" : ""}`} style={{ transform: ready ? undefined : "rotate(-90deg)", animationDuration: "0.9s" }}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={ready ? C * 0.25 : C * (1 - Math.min(pull, 1))}
          />
        </svg>
        <ChevronUp
          size={20}
          className="text-white"
          style={{ transform: `rotate(${ready ? 180 : Math.round(pull * 180)}deg)`, transition: ready ? "transform 220ms ease" : "transform 40ms linear" }}
        />
      </div>
      <span className="text-white/90 text-[12px] leading-none">{label}</span>
    </div>
  );
};

export const VanishBottomHint = ({ on }) => (
  <div className={`flex flex-col items-center pt-3 pb-1 select-none ${on ? "text-white/85" : "text-wa-muted/70"}`}>
    <ChevronUp size={16} className={on ? "text-white/85" : "text-wa-muted/70"} />
    <span className="text-[11.5px] leading-tight mt-0.5">
      {on ? "👻 Vanish mode is on · swipe up to turn off" : "Swipe up to turn on Vanish mode"}
    </span>
  </div>
);
