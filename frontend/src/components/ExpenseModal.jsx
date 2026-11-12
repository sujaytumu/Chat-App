import { useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";
import { rupees } from "../lib/expense";

const first = (p) => String(p?.fullName || "Someone").trim().split(/\s+/)[0];

// "Split bill": what it was, how much you paid, who shares it. Equal split; everyone can then mark their share paid.
const ExpenseModal = ({ people, meId, onClose, onSend }) => {
  useBackToClose(true, onClose);
  const everyone = useMemo(() => Object.values(people).filter((p) => p?._id), [people]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState(() => everyone.map((p) => String(p._id)));
  const [sending, setSending] = useState(false);
  const total = Math.round(Number(amount) * 100);
  const ok = title.trim() && total >= 100 && picked.length >= 1;
  const each = ok ? Math.floor(total / picked.length) : 0;
  const toggle = (id) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const submit = async () => {
    if (!ok || sending) return;
    setSending(true);
    try {
      await onSend({ title: title.trim(), amount: Number(amount), splitAmong: picked });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close"><X size={22} /></button>
          <h3 className="flex-1 text-[17px] text-wa-text">Split a bill</h3>
          <button onClick={submit} disabled={!ok || sending} className="h-9 px-5 rounded-full bg-[#25D366] text-wa-bg text-[14px] font-medium disabled:opacity-40">Send</button>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-5">
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">What was it for?</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Dinner, cab, tickets" className="w-full rounded-xl bg-wa-field px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted outline-none" />
          </div>
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">Total you paid (₹)</p>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1"))} inputMode="decimal" placeholder="0" className="w-full rounded-xl bg-wa-field px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted outline-none" />
          </div>
          {everyone.length > 2 && (
            <div>
              <p className="text-[13px] text-wa-muted mb-1.5">Split between</p>
              <div className="flex flex-wrap gap-2">
                {everyone.map((p) => {
                  const id = String(p._id);
                  const on = picked.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => toggle(id)} className={`h-9 pl-3 pr-3.5 rounded-full text-[13px] border flex items-center gap-1.5 ${on ? "bg-[#25D366] border-[#25D366] text-wa-bg font-medium" : "border-wa-text/25 text-wa-text/90"}`}>
                      {on && <Check size={14} strokeWidth={3.5} />}
                      {id === String(meId) ? "You" : first(p)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[12.5px] text-wa-muted">
            {ok ? `${rupees(each)} each between ${picked.length} ${picked.length === 1 ? "person" : "people"}` : "Enter what it was for and the amount"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExpenseModal;
