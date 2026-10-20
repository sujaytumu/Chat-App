import { ChevronUp } from "lucide-react";

// Instagram-style Vanish mode visuals for a 1:1 chat.
//  - <VanishPullIndicator>: shown while you drag up past the last message. A ring fills with the
//    pull (the "loading" symbol), the arrow inside rotates a half-turn, and once it is switching the
//    ring spins until the server confirms.
//  - <VanishBottomHint>: the small "Swipe up to turn on/off Vanish mode" line under the last message.

const R = 15;
const C = 2 * Math.PI * R;

export const VanishPullIndicator = ({ pull, busy, turningOn }) => {
  const progress = busy ? 0.28 : pull;
  const ready = !busy && pull >= 1;
  const label = busy
    ? `Turning ${turningOn ? "on" : "off"} Vanish mode…`
    : `${ready ? "Release to" : "Swipe up to"} turn ${turningOn ? "on" : "off"} Vanish mode`;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-1.5"
      style={{ opacity: busy ? 1 : 0.35 + pull * 0.65, transform: `translateY(${busy ? 0 : -pull * 16}px)` }}
      aria-live="polite"
    >
      <div className="relative size-10 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
        <svg viewBox="0 0 36 36" className={`absolute inset-0 size-full ${busy ? "animate-spin" : ""}`} style={{ transform: busy ? undefined : "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" />
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: busy ? undefined : "stroke-dashoffset 60ms linear" }}
          />
        </svg>
        <ChevronUp
          size={20}
          className="text-white"
          style={{
            transform: `rotate(${busy ? 180 : Math.round(pull * 180)}deg)`,
            opacity: busy ? 0.5 : 1,
            transition: busy ? "transform 250ms ease, opacity 250ms ease" : "transform 60ms linear",
          }}
        />
      </div>
      <span className="rounded-full bg-black/55 backdrop-blur-sm text-white px-3 py-1 text-[12px] leading-none">{label}</span>
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
