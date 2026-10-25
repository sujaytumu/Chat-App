import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

// Create / edit the poll sticker of a status (question + 2–4 options)
const PollSheet = ({ initial, onClose, onDone }) => {
  const [q, setQ] = useState(initial?.question || "");
  const [opts, setOpts] = useState(initial?.options?.length ? initial.options : ["", ""]);
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim() && clean.length >= 2;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-wa-panel p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h3 className="flex-1 text-[15.5px] text-wa-text">Add poll</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close"><X size={20} /></button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} placeholder="Ask a question…" className="w-full rounded-xl bg-wa-field text-wa-text placeholder:text-wa-muted px-3.5 py-3 text-[14px] focus:outline-none" />
        <div className="mt-2 space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={o} onChange={(e) => setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} placeholder={`Option ${i + 1}`} className="flex-1 rounded-xl bg-wa-field text-wa-text placeholder:text-wa-muted px-3.5 py-2.5 text-[14px] focus:outline-none" />
              {opts.length > 2 && (
                <button onClick={() => setOpts((a) => a.filter((_, j) => j !== i))} className="text-wa-muted" aria-label="Remove option"><Trash2 size={17} /></button>
              )}
            </div>
          ))}
        </div>
        {opts.length < 4 && (
          <button onClick={() => setOpts((a) => [...a, ""])} className="mt-2 flex items-center gap-1.5 text-[13px] text-[#21C063]"><Plus size={16} /> Add option</button>
        )}
        <div className="mt-4 flex gap-2">
          {initial && <button onClick={() => onDone(null)} className="flex-1 h-11 rounded-full bg-wa-field text-wa-text text-[14px]">Remove</button>}
          <button disabled={!ok} onClick={() => onDone({ question: q.trim(), options: clean })} className="flex-1 h-11 rounded-full bg-[#00A884] disabled:opacity-40 text-white text-[14px] font-medium">Done</button>
        </div>
      </div>
    </div>
  );
};

export default PollSheet;
