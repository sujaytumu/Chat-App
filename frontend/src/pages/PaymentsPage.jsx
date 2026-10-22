import { useEffect, useState } from "react";
import { Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import SettingsShell from "../components/SettingsShell";
import Avatar from "../components/Avatar";
import { axiosInstance } from "../lib/axios";
import { inr } from "../lib/razorpay";

const when = (iso) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const PaymentsPage = () => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    axiosInstance.get("/payments").then((r) => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, []);
  return (
    <SettingsShell title="Payments" flush>
      {rows === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-wa-muted" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-wa-muted text-[14px] py-16 px-8">No payments yet. Open a chat, tap the paperclip and choose Payment.</p>
      ) : (
        rows.map((p) => (
          <div key={p._id} className="flex items-center gap-3 px-4 py-3">
            <Avatar src={p.other?.profilePic} name={p.other?.fullName || ""} size="size-12" textSize="text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] truncate">{p.other?.fullName || "Someone"}</p>
              <p className="text-[12.5px] text-wa-muted truncate flex items-center gap-1">
                {p.direction === "sent" ? <ArrowUpRight size={14} className="text-[#F15C6D]" /> : <ArrowDownLeft size={14} className="text-[#25D366]" />}
                {when(p.paidAt)}
                {p.test ? " · test" : ""}
                {p.note ? ` · ${p.note}` : ""}
              </p>
            </div>
            <p className={`text-[15.5px] font-medium ${p.direction === "sent" ? "text-wa-text" : "text-[#25D366]"}`}>
              {p.direction === "sent" ? "-" : "+"}
              {inr(p.amount)}
            </p>
          </div>
        ))
      )}
    </SettingsShell>
  );
};

export default PaymentsPage;
