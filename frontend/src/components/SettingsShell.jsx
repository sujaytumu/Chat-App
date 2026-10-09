import { Link } from "react-router-dom";
import { WaBack } from "./icons/WaIcons";

// Common frame for every Settings screen: back arrow + title on top, scrolling
// content below (the bottom bar stays visible, like WhatsApp).
const SettingsShell = ({ title, children, back = "/profile", right = null, flush = false }) => (
  <div className="flex-1 min-w-0 flex flex-col bg-wa-bg text-wa-text overflow-hidden">
    <div className="flex items-center h-14 pl-1 pr-4 shrink-0">
      <Link to={back} className="size-12 rounded-full flex items-center justify-center active:bg-white/10" aria-label="Back">
        <WaBack size={24} />
      </Link>
      <h1 className="text-[22px] font-normal pl-3 truncate flex-1">{title}</h1>
      {right}
    </div>
    <div className="flex-1 overflow-y-auto pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-8">
      <div className={`mx-auto w-full max-w-2xl ${flush ? "" : "px-4 space-y-4"}`}>{children}</div>
    </div>
  </div>
);

export default SettingsShell;

// WhatsApp-style switch: green track, dark thumb with a tick
export const Switch = ({ checked }) => (
  <span className={`relative w-[52px] h-8 rounded-full shrink-0 transition-colors ${checked ? "bg-[#21C063]" : "bg-[#3B4A54]"}`}>
    <span
      className={`absolute top-1 size-6 rounded-full flex items-center justify-center transition-all ${
        checked ? "left-[24px] bg-wa-bg text-[#21C063]" : "left-1 bg-wa-muted"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  </span>
);

export const ToggleRow = ({ title, sub, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-full flex items-center gap-4 p-4 rounded-xl bg-wa-surface text-left"
    role="switch"
    aria-checked={checked}
  >
    <span className="flex-1 min-w-0">
      <span className="block text-[16px] text-wa-text">{title}</span>
      {sub && <span className="block text-[13.5px] text-wa-muted mt-0.5">{sub}</span>}
    </span>
    <Switch checked={checked} />
  </button>
);
