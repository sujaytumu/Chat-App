import { useState } from "react";
import { Clock, X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtWhen = (d) =>
  new Date(d).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
  const presets = [
    { label: "In 1 hour", date: new Date(Date.now() + 3600 * 1000) },
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
        className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl pb-[calc(14px+env(safe-area-inset-bottom))]"
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

        {presets.map((p) => (
          <button
            key={p.label}
            disabled={busy}
            onClick={() => onPick(p.date)}
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
            onChange={(e) => setCustom(e.target.value)}
            className="flex-1 min-w-0 h-11 rounded-xl bg-wa-field px-3 text-[13.5px] text-wa-text outline-none"
          />
          <button
            disabled={!customOk || busy}
            onClick={() => onPick(customDate)}
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
