import { useEffect } from "react";
import { Delete } from "lucide-react";
import { PIN_MAX } from "../lib/appLock";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Dots + number keys. The parent owns the digits so it can check them however it likes.
const PinPad = ({ pin, onChange, onSubmit, disabled, shake = 0 }) => {
  const add = (d) => !disabled && pin.length < PIN_MAX && onChange(pin + d);
  const del = () => !disabled && onChange(pin.slice(0, -1));

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) add(e.key);
      else if (e.key === "Backspace") del();
      else if (e.key === "Enter") onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div key={shake} className="mt-5 flex justify-center gap-3 h-4" style={shake ? { animation: "applock-shake .35s" } : undefined}>
        {Array.from({ length: PIN_MAX }).map((_, i) => (
          <span key={i} className={`size-3.5 rounded-full border-2 transition-colors ${i < pin.length ? "bg-[#25d366] border-[#25d366]" : "border-wa-muted2"}`} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2.5 place-items-center">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => add(k)} className="size-[62px] rounded-full bg-wa-surface hover:bg-wa-hover active:scale-95 transition text-[22px]">
            {k}
          </button>
        ))}
        <button type="button" onClick={del} className="size-[62px] rounded-full flex items-center justify-center text-wa-icon hover:bg-wa-hover active:scale-95 transition" aria-label="Delete">
          <Delete size={22} />
        </button>
        <button type="button" onClick={() => add("0")} className="size-[62px] rounded-full bg-wa-surface hover:bg-wa-hover active:scale-95 transition text-[22px]">
          0
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || pin.length < 4}
          className="size-[62px] rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 transition"
          style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}
          aria-label="Continue"
        >
          <span className="text-[24px] leading-none">→</span>
        </button>
      </div>
      <style>{`@keyframes applock-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
    </>
  );
};

export default PinPad;
