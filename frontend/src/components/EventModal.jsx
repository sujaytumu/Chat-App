import { useState } from "react";
import { X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const pad = (n) => String(n).padStart(2, "0");
const toDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "Create event": name, date, time, place, details — people answer Going / Maybe / Can't go.
const EventModal = ({ onClose, onSend }) => {
  useBackToClose(true, onClose);
  const soon = new Date(Date.now() + 24 * 3600 * 1000);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDate(soon));
  const [time, setTime] = useState("18:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const startsAt = new Date(`${date}T${time}`);
  const ok = title.trim() && !Number.isNaN(startsAt.getTime());

  const submit = async () => {
    if (!ok || sending) return;
    setSending(true);
    try {
      await onSend({ title: title.trim(), startsAt: startsAt.toISOString(), location: location.trim(), description: description.trim() });
      onClose();
    } finally {
      setSending(false);
    }
  };
  const field = "w-full h-12 rounded-xl bg-wa-field px-4 text-[14.5px] text-wa-text placeholder:text-wa-muted outline-none";

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close">
            <X size={22} />
          </button>
          <h3 className="flex-1 text-[17px] text-wa-text">Create event</h3>
          <button onClick={submit} disabled={!ok || sending} className="h-9 px-5 rounded-full bg-[#25D366] text-wa-bg text-[14px] font-medium disabled:opacity-40">
            Send
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-5 pt-2 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="Event name" className={field} />
          <div className="flex gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} flex-1`} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-32`} />
          </div>
          <input value={location} onChange={(e) => setLocation(e.target.value.slice(0, 120))} placeholder="Location (optional)" className={field} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="Description (optional)"
            className="w-full rounded-xl bg-wa-field px-4 py-3 text-[14.5px] text-wa-text placeholder:text-wa-muted outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
};

export default EventModal;
