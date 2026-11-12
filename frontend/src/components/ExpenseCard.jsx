import { Receipt, Check } from "lucide-react";
import { shareOf, rupees } from "../lib/expense";

const first = (p) => String(p?.fullName || "Someone").trim().split(/\s+/)[0];

// A split bill inside a message bubble: who paid, each person's share, and who has paid their share back.
const ExpenseCard = ({ message, authUserId, people, onSettle, onBalances }) => {
  const ex = message.expense;
  const payer = String(message.senderId?._id ?? message.senderId);
  const me = String(authUserId);
  const settled = new Set((ex.settled || []).map(String));
  const owing = (ex.splitAmong || []).map(String).filter((id) => id !== payer);
  const paidCount = owing.filter((id) => settled.has(id)).length;
  return (
    <div className="w-[260px] max-w-full pb-4">
      <div className="flex items-start gap-3">
        <span className="size-11 shrink-0 rounded-xl bg-[#25D366]/15 text-[#25D366] flex items-center justify-center">
          <Receipt size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold leading-snug break-words">{ex.title}</p>
          <p className="text-[12px] text-wa-text/70">
            {payer === me ? "You" : first(people[payer])} paid {rupees(ex.amount)} · split {(ex.splitAmong || []).length} way{(ex.splitAmong || []).length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {owing.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {owing.map((id) => {
            const paid = settled.has(id);
            const canToggle = id === me || payer === me;
            return (
              <div key={id} className="flex items-center gap-2 rounded-xl border border-wa-text/10 px-2.5 py-1.5">
                <span className="flex-1 min-w-0 text-[13px] truncate">{id === me ? "You" : first(people[id])}</span>
                <span className="text-[12.5px] tabular-nums text-wa-text/80">{rupees(shareOf(ex, id))}</span>
                <button
                  type="button"
                  disabled={!canToggle}
                  onClick={() => onSettle(id, !paid)}
                  className={`h-7 min-w-[64px] px-2.5 rounded-full text-[11.5px] font-medium flex items-center justify-center gap-1 ${paid ? "bg-[#25D366] text-wa-bg" : "border border-wa-text/30 text-wa-text/85"} ${canToggle ? "" : "opacity-60"}`}
                >
                  {paid ? <><Check size={12} strokeWidth={3.5} /> Paid</> : id === me ? "I paid" : "Owes"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11.5px] text-wa-text/60">{owing.length ? `${paidCount}/${owing.length} paid back` : "Only the payer’s own share"}</span>
        <button type="button" onClick={onBalances} className="text-[12.5px] font-medium text-[#25D366]">Who owes whom</button>
      </div>
    </div>
  );
};

export default ExpenseCard;
