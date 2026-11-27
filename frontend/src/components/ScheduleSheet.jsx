import { useState } from "react";
import { Clock, X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtWhen = (d) =>
  new Date(d).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Repeating schedules (messages and calls): it stops by itself one year after it was set up.
export const REPEAT_OPTIONS = [
  ["none", "Doesn't repeat"],
  ["daily", "Every day"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
  ["yearly", "Every year"],
];
export const repeatLabel = (r) => (REPEAT_OPTIONS.find(([k]) => k === r)?.[1] || "").toLowerCase();
export const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
export const oneYearFromNow = () => new Date(Date.now() + 365 * 24 * 3600 * 1000);
export const untilLabel = () => oneYearFromNow().toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export const RepeatPicker = ({ value, onChange }) => (
  <div className="px-5 pt-1 pb-2">
    <label className="block text-[12.5px] text-wa-muted mb-1">Repeat</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-11 rounded-xl bg-wa-field px-3 text-[14px] text-wa-text outline-none"
    >
      {REPEAT_OPTIONS.map(([k, label]) => (
        <option key={k} value={k}>{label}</option>
      ))}
    </select>
    {value !== "none" && <p className="mt-1 text-[12px] text-wa-muted">Keeps going at the same time until {untilLabel()} (1 year), then stops</p>}
  </div>
);

const at = (dayOffset, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// Bottom sheet opened by long-pressing Send: choose when the message goes out.
const ScheduleSheet = ({ text, busy, onPick, onClose }) => {
  useBackToClose(true, onClose);
  const now = new Date();
  const [repeat, setRepeat] = useState("none");
  const presets = [
    { label: "In 1 hour", date: new Date(Date.now() + 3600 * 1000) },
    { label: "12 AM (midnight)", date: at(1, 0) }, // e.g. a birthday wish that arrives at the stroke of midnight
    now.getHours() < 20 && { label: "Tonight", date: at(0, 21) },
    now.getHours() < 7 && { label: "This morning", date: at(0, 8) },
    { label: "Tomorrow morning", date: at(1, 8) },
    { label: "Tomorrow evening", date: at(1, 19) },
  ].filter(Boolean);
  const [custom, setCustom] = useState(toLocalInput(new Date(Date.now() + 2 * 3600 * 1000)));
  const customDate = new Date(custom);
  const customOk = !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now() + 30000;

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-wa-panel text-wa-text rounded-t-3xl pb-[calc(14px+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/20" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-1">
          <Clock size={20} className="text-[#00A884]" />
          <h3 className="flex-1 text-[16px] font-medium">Schedule message</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <p className="mx-5 mt-1 mb-3 px-3 py-2 rounded-xl bg-wa-out text-[13px] line-clamp-2 break-words">{text}</p>

        <RepeatPicker value={repeat} onChange={setRepeat} />

        {presets.map((p) => (
          <button
            key={p.label}
            disabled={busy}
            onClick={() => onPick(p.date, repeat)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-white/5 active:bg-white/10 disabled:opacity-50"
          >
            <span className="text-[14px]">{p.label}</span>
            <span className="text-[12.5px] text-wa-muted">{fmtWhen(p.date)}</span>
          </button>
        ))}

        <div className="px-5 pt-3 flex items-center gap-3 border-t border-white/10 mt-1">
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date(Date.now() + 60000))}
            max={toLocalInput(oneYearFromNow())}
            onChange={(e) => setCustom(e.target.value)}
            className="flex-1 min-w-0 h-11 rounded-xl bg-wa-field px-3 text-[13.5px] text-wa-text outline-none"
          />
          <button
            disabled={!customOk || busy}
            onClick={() => onPick(customDate, repeat)}
            className="h-11 px-5 rounded-full bg-[#00A884] text-white text-[14px] disabled:opacity-40"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSheet;
