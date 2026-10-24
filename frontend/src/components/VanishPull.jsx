import { ChevronUp, Timer, Bell, ShieldCheck } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";

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
  const p = Math.min(pull, 1);
  const label = busy
    ? `Turning ${turningOn ? "on" : "off"} disappearing messages…`
    : ready
      ? `Release to turn ${turningOn ? "on" : "off"}`
      : `Swipe up to turn ${turningOn ? "on" : "off"} disappearing messages`;
  // a short buzz the moment the pull is far enough (like Instagram)
  useEffect(() => {
    if (ready && !busy) {
      try { navigator.vibrate?.(18); } catch { /* not available */ }
    }
  }, [ready, busy]);
  const scale = busy ? 1 : 0.5 + p * 0.5;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center justify-center gap-3 overflow-hidden"
      style={{
        height: px,
        background: `linear-gradient(to top, rgba(0,0,0,${0.35 + p * 0.45}), rgba(0,0,0,${p * 0.12}))`,
        opacity: busy ? 1 : Math.min(1, pull * 1.8),
        transition: busy ? "height 200ms ease" : undefined,
      }}
      aria-live="polite"
    >
      <div className="relative size-[60px] flex items-center justify-center" style={{ transform: `scale(${scale})` }}>
        {ready && <span className="absolute inset-0 rounded-full border-2 border-white/60 animate-ping" />}
        <span className="absolute inset-[5px] rounded-full" style={{ background: ready ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)", transition: "background 200ms" }} />
        <svg viewBox="0 0 36 36" className={`absolute inset-0 size-full ${busy ? "animate-spin" : ""}`} style={{ transform: busy ? undefined : "rotate(-90deg)", animationDuration: "0.8s" }}>
          <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={busy ? C * 0.7 : C * (1 - p)}
            style={{ transition: busy ? undefined : "stroke-dashoffset 40ms linear" }}
          />
        </svg>
        <ChevronUp
          size={26}
          className="text-white"
          style={{
            transform: `translateY(${ready ? -2 : (1 - p) * 4}px) rotate(${ready ? 180 : 0}deg)`,
            transition: "transform 260ms cubic-bezier(.2,1.4,.4,1)",
          }}
        />
      </div>
      <span className="text-white text-[12.5px] font-medium leading-none">{label}</span>
    </div>
  );
};

export const VanishBottomHint = ({ on }) => (
  <div className={`flex flex-col items-center pt-3 pb-1 select-none ${on ? "text-white/85" : "text-wa-muted/70"}`}>
    <ChevronUp size={16} className={on ? "text-white/85" : "text-wa-muted/70"} />
    <span className="text-[11.5px] leading-tight mt-0.5">
      {on ? "Swipe up to turn off disappearing messages" : "Swipe up to turn on disappearing messages"}
    </span>
  </div>
);

// The centred line in the chat: "You turned on disappearing messages. … Change" / "Name turned off … Turn on".
export const VanishNotice = ({ message, mine, name, onToggle }) => {
  const on = message.system === "vanish_on";
  const who = mine ? "You" : name || "Someone in the chat";
  return (
    <div className="flex justify-center px-6 py-2.5" title={`${who} turned ${on ? "on" : "off"} disappearing messages`}>
      <span className="inline-flex items-center gap-2 rounded-full bg-wa-surface/90 px-3.5 py-1.5 text-[12px] text-wa-text/85 shadow-sm">
        <Timer size={13} className={on ? "text-[#25D366]" : "text-wa-muted"} />
        Disappearing messages {on ? "on" : "off"}
        <button type="button" onClick={onToggle} className="font-medium text-[#6aa7ff] active:opacity-70">
          {on ? "Turn off" : "Turn on"}
        </button>
      </span>
    </div>
  );
};

// First time only (like Instagram): what disappearing messages mean, then OK turns it on.
export const VanishIntro = ({ onOk, onClose }) =>
  createPortal(
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-[#12171c] text-white rounded-t-3xl sm:rounded-3xl px-6 pt-8 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto size-14 rounded-full border-2 border-dashed border-[#a78bfa] flex items-center justify-center mb-4">
          <Timer size={26} className="text-white" />
        </div>
        <h2 className="text-center text-[24px] font-bold leading-tight mb-6">Not all messages need to stick around</h2>
        {[
          [Timer, "Swipe up for disappearing messages", "New messages will disappear for everyone in the chat after they have been seen."],
          [Bell, "You'll get screenshot notifications", "If a screenshot is detected, a notice will appear in the chat."],
          [ShieldCheck, "Conversations can still be reported", "Disappearing messages can be reported for a while after they disappear."],
        ].map(([Icon, title, body]) => (
          <div key={title} className="flex gap-4 mb-5">
            <Icon size={24} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[15.5px] leading-snug">{title}</p>
              <p className="text-[14px] text-white/65 leading-snug mt-0.5">{body}</p>
            </div>
          </div>
        ))}
        <button onClick={onOk} className="w-full h-12 rounded-xl bg-[#2f6bff] text-white font-semibold text-[16px] mt-2">
          OK
        </button>
      </div>
    </div>,
    document.body
  );
