import { IndianRupee, CheckCircle2 } from "lucide-react";
import { inr } from "../lib/razorpay";

// A payment inside a message bubble.
const PaymentCard = ({ message, isMe }) => {
  const p = message.payment;
  return (
    <div className="w-[232px] max-w-full pb-4">
      <div className="flex items-center gap-3">
        <span className="size-11 shrink-0 rounded-full bg-[#25D366]/18 text-[#25D366] flex items-center justify-center">
          <IndianRupee size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[22px] font-semibold leading-tight">{inr(p.amount)}</p>
          <p className="text-[12px] text-wa-text/70 flex items-center gap-1">
            <CheckCircle2 size={13} className="text-[#25D366]" /> {isMe ? "You paid" : "Paid you"}
            {p.test ? " · test" : ""}
          </p>
        </div>
      </div>
      {p.note && <p className="mt-2 text-[13px] break-words text-wa-text/90">{p.note}</p>}
      {p.paymentId && <p className="mt-1.5 text-[10.5px] text-wa-text/50 break-all">{p.paymentId}</p>}
    </div>
  );
};

export default PaymentCard;
