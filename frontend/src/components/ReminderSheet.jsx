import { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, Bell } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";

const tomorrow9 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};
const inMinutes = (m) => new Date(Date.now() + m * 60_000);
const pad = (n) => String(n).padStart(2, "0");
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "Remind me" on a message: pick when, and you get a notification with the message.
const ReminderSheet = ({ message, onClose }) => {
  useBackToClose(true, onClose);
  const [custom, setCustom] = useState(localInput(inMinutes(120)));
  const [busy, setBusy] = useState(false);

  const save = async (when) => {
    setBusy(true);
    try {
      await axiosInstance.post("/messages/reminders", { messageId: message._id, remindAt: when.toISOString() });
      toast.success(`Reminder set for ${when.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't set the reminder");
      setBusy(false);
    }
  };

  const presets = [
    ["In 20 minutes", () => inMinutes(20)],
    ["In 1 hour", () => inMinutes(60)],
    ["In 3 hours", () => inMinutes(180)],
    ["Tomorrow, 9:00 AM", tomorrow9],
  ];
  const customDate = new Date(custom);
  const customOk = Number.isFinite(customDate.getTime()) && customDate.getTime() > Date.now() + 30_000;

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[17px] font-semibold flex items-center gap-2"><Bell size={19} /> Remind me</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted"><X size={22} /></button>
        </div>
        <p className="text-[13px] text-wa-muted line-clamp-2 mb-3">{message.text || (message.image ? "📷 Photo" : message.file ? "📎 Attachment" : "Message")}</p>
        <div className="grid grid-cols-2 gap-2">
          {presets.map(([label, when]) => (
            <button key={label} disabled={busy} onClick={() => save(when())} className="h-11 rounded-full bg-wa-field text-[13.5px] font-medium active:scale-95 transition-transform disabled:opacity-50">
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1 min-w-0 h-11 rounded-full bg-wa-field px-4 text-[13.5px] outline-none [color-scheme:dark]" />
          <button disabled={busy || !customOk} onClick={() => save(customDate)} className="h-11 px-5 rounded-full bg-[#21C063] text-[#0B141A] text-[13.5px] font-semibold disabled:opacity-40">
            Set
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReminderSheet;
