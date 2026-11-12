import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import { rupees } from "../lib/expense";

const first = (p) => String(p?.fullName || "Someone").trim().split(/\s+/)[0];

// Everything unpaid in this chat boiled down to the fewest payments ("Ravi pays Sujay ₹500").
const BalancesSheet = ({ chat, people, authUserId, onClose }) => {
  useBackToClose(true, onClose);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const params = chat.type === "group" ? { groupId: chat.data._id } : { userId: chat.data._id };
    axiosInstance.get("/messages/expenses/balances", { params }).then((r) => live && setData(r.data)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [chat.type, chat.data._id]);
  const me = String(authUserId);
  const name = (id) => (String(id) === me ? "You" : first(people[String(id)]));
  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close"><X size={22} /></button>
          <h3 className="flex-1 text-[17px] text-wa-text">Who owes whom</h3>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-2">
          {!data && !failed && <div className="py-8 flex justify-center text-wa-muted"><Loader2 className="animate-spin" /></div>}
          {failed && <p className="py-6 text-center text-[14px] text-wa-muted">Could not load the balances. Try again.</p>}
          {data && data.transfers.length === 0 && (
            <p className="py-8 text-center text-[15px] text-wa-text">{data.count ? "All settled up 🎉" : "No bills yet — add one from the attach menu"}</p>
          )}
          {data?.transfers.map((t, i) => {
            const mineOut = String(t.from) === me;
            const mineIn = String(t.to) === me;
            return (
              <div key={i} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${mineOut ? "bg-[#F15C6D]/12" : mineIn ? "bg-[#25D366]/12" : "bg-wa-surface"}`}>
                <p className="flex-1 min-w-0 text-[14px] text-wa-text">
                  <span className="font-medium">{name(t.from)}</span> {String(t.from) === me ? "pay" : "pays"} <span className="font-medium">{name(t.to)}</span>
                </p>
                <span className="text-[15px] font-semibold tabular-nums text-wa-text">{rupees(t.amount)}</span>
              </div>
            );
          })}
          {data && data.transfers.length > 0 && <p className="pt-1 text-[11.5px] text-wa-muted">Based on unpaid bills in this chat.</p>}
        </div>
      </div>
    </div>
  );
};

export default BalancesSheet;
