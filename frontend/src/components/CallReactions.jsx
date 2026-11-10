import { useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";

// Same list the server accepts.
export const CALL_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "👏", "🔥"];
const EVENT = "talkies:call-reaction";

// Show a floating emoji on this screen (own tap, or one received from the other side).
export const showCallReaction = (emoji, name = "") => {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { emoji, name } }));
  } catch {
    /* not available */
  }
};

// A slim row of emoji buttons above the call controls (and a raise-hand button in group calls).
export const CallReactionBar = ({ onEmoji, onHand, handOn }) => (
  <div className="shrink-0 flex items-center justify-center gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
    {CALL_REACTIONS.map((e) => (
      <button
        key={e}
        type="button"
        onClick={() => onEmoji(e)}
        aria-label={`React ${e}`}
        className="size-10 shrink-0 rounded-full bg-white/10 text-[22px] leading-none flex items-center justify-center active:scale-90 transition-transform"
      >
        {e}
      </button>
    ))}
    {onHand && (
      <button
        type="button"
        onClick={onHand}
        aria-label={handOn ? "Lower hand" : "Raise hand"}
        className={`size-10 shrink-0 rounded-full flex items-center justify-center active:scale-90 transition-colors ${
          handOn ? "bg-[#FFD54A] text-black" : "bg-white/10 text-white"
        }`}
      >
        <Hand size={20} />
      </button>
    )}
  </div>
);

// Emojis drift up the screen and fade; mounted once inside each call screen.
export const CallReactionLayer = () => {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    const on = (e) => {
      const { emoji, name } = e.detail || {};
      if (!emoji) return;
      const id = ++seq.current;
      const left = 12 + Math.random() * 70; // % across the screen
      setItems((l) => [...l.slice(-14), { id, emoji, name, left }]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 2800);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  if (!items.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      <style>{"@keyframes callReactUp{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:1;transform:translateY(-20px) scale(1.1)}100%{transform:translateY(-62vh) scale(1);opacity:0}}@media (prefers-reduced-motion:reduce){.call-react{animation-duration:.01s!important}}"}</style>
      {items.map((x) => (
        <div key={x.id} className="call-react absolute bottom-40 flex flex-col items-center" style={{ left: `${x.left}%`, animation: "callReactUp 2.6s ease-out forwards" }}>
          <span className="text-[40px] leading-none drop-shadow">{x.emoji}</span>
          {x.name && <span className="mt-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">{x.name}</span>}
        </div>
      ))}
    </div>
  );
};
