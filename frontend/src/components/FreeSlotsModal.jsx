import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const PARTS = [
  { key: "Morning", hour: 10 },
  { key: "Afternoon", hour: 14 },
  { key: "Evening", hour: 18 },
  { key: "Night", hour: 21 },
];
const MAX_SLOTS = 12;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// "When are we free?": tick the days and parts of the day that could work; everybody then ticks the ones they can
// make, and the best slot rises to the top. Sent as a poll (kind "free") so voting, ticks and updates are shared.
const FreeSlotsModal = ({ onClose, onSend }) => {
  useBackToClose(true, onClose);
  const days = useMemo(() => {
    const t = new Date();
    return Array.from({ length: 14 }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
  }, []);
  const [title, setTitle] = useState("");
  const [pickedDays, setPickedDays] = useState([]);
  const [pickedParts, setPickedParts] = useState(["Evening"]);
  const [sending, setSending] = useState(false);

  const slots = useMemo(() => {
    const out = [];
    for (const d of days) {
      if (!pickedDays.includes(dayKey(d))) continue;
      for (const p of PARTS) {
        if (!pickedParts.includes(p.key)) continue;
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), p.hour, 0, 0);
        if (at.getTime() < Date.now()) continue; // already gone today
        out.push({ text: `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · ${p.key}`, at: at.toISOString() });
      }
    }
    return out;
  }, [days, pickedDays, pickedParts]);

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const ok = slots.length >= 2 && slots.length <= MAX_SLOTS;

  const submit = async () => {
    if (!ok || sending) return;
    setSending(true);
    try {
      await onSend({ question: title.trim() || "When are we free?", kind: "free", multiple: true, options: slots });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const chip = (on) => `shrink-0 h-10 px-4 rounded-full text-[13.5px] border transition-colors ${on ? "bg-[#25D366] border-[#25D366] text-wa-bg font-medium" : "border-wa-text/25 text-wa-text/90"}`;

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close">
            <X size={22} />
          </button>
          <h3 className="flex-1 text-[17px] text-wa-text">When are we free?</h3>
          <button onClick={submit} disabled={!ok || sending} className="h-9 px-5 rounded-full bg-[#25D366] text-wa-bg text-[14px] font-medium disabled:opacity-40">
            Send
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-5">
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">What for? (optional)</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Trip planning, movie night"
              className="w-full rounded-xl bg-wa-field px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted outline-none"
            />
          </div>
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">Days that could work</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {days.map((d, i) => {
                const k = dayKey(d);
                return (
                  <button key={k} type="button" onClick={() => toggle(pickedDays, setPickedDays, k)} className={`${chip(pickedDays.includes(k))} flex flex-col items-center justify-center !h-14 !px-3.5 leading-tight`}>
                    <span className="text-[11px] opacity-80">{i === 0 ? "Today" : d.toLocaleDateString([], { weekday: "short" })}</span>
                    <span className="text-[15px]">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">Time of day</p>
            <div className="flex flex-wrap gap-2">
              {PARTS.map((p) => (
                <button key={p.key} type="button" onClick={() => toggle(pickedParts, setPickedParts, p.key)} className={chip(pickedParts.includes(p.key))}>
                  {p.key}
                </button>
              ))}
            </div>
          </div>
          <p className={`text-[12.5px] ${slots.length > MAX_SLOTS ? "text-[#F15C6D]" : "text-wa-muted"}`}>
            {slots.length > MAX_SLOTS ? `Too many options (${slots.length}) — pick up to ${MAX_SLOTS}` : slots.length < 2 ? "Pick at least 2 options" : `${slots.length} options for everyone to tick`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FreeSlotsModal;
