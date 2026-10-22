import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import { loadRazorpay } from "../lib/razorpay";
import Avatar from "./Avatar";

const QUICK = [10, 50, 100, 500];

// "Pay": send money to the person in this chat through Razorpay. Test mode uses play money only.
const PaymentModal = ({ user, onClose }) => {
  useBackToClose(true, onClose);
  const authUser = useAuthStore((s) => s.authUser);
  const [cfg, setCfg] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axiosInstance.get("/payments/config").then((r) => setCfg(r.data)).catch(() => setCfg({ enabled: false }));
  }, []);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= (cfg?.min || 1) && value <= (cfg?.max || 100000);

  const pay = async () => {
    if (!valid || busy) return;
    setBusy(true);
    let order;
    try {
      const [Razorpay, res] = await Promise.all([loadRazorpay(), axiosInstance.post("/payments/order", { toUserId: user._id, amount: value, note })]);
      order = res.data;
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Talkies",
        description: `Pay ${user.fullName}${note.trim() ? ` · ${note.trim()}` : ""}`,
        prefill: { name: authUser?.fullName || "" },
        theme: { color: "#25D366" },
        modal: {
          ondismiss: () => {
            axiosInstance.post("/payments/cancel", { orderId: order.orderId }).catch(() => {});
            setBusy(false);
          },
        },
        handler: async (response) => {
          try {
            const r = await axiosInstance.post("/payments/verify", response);
            const msg = r.data?.message;
            if (msg) {
              const st = useChatStore.getState();
              if (st.selectedChat?.type === "direct" && String(st.selectedChat.data._id) === String(user._id) && !st.messages.some((m) => m._id === msg._id)) {
                useChatStore.setState({ messages: [...st.messages, msg] });
              }
            }
            toast.success("Payment sent");
            onClose();
          } catch (e) {
            toast.error(e.response?.data?.error || "Couldn't confirm the payment");
            setBusy(false);
          }
        },
      });
      rzp.on("payment.failed", (resp) => {
        toast.error(resp?.error?.description || "Payment failed");
        axiosInstance.post("/payments/cancel", { orderId: order.orderId }).catch(() => {});
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || "Couldn't start the payment");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-wa-panel text-wa-text p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] font-semibold">Send money</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Avatar src={user.profilePic} name={user.fullName} size="size-12" textSize="text-lg" />
          <div className="min-w-0">
            <p className="text-[15.5px] font-medium truncate">{user.fullName}</p>
            <p className="text-[12px] text-wa-muted">Paid securely with Razorpay</p>
          </div>
        </div>

        {cfg && !cfg.enabled ? (
          <p className="rounded-2xl bg-wa-field px-4 py-4 text-[14px] text-wa-muted">Payments aren't switched on yet. The server needs its Razorpay keys.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-center gap-1 rounded-2xl bg-wa-field py-5">
              <span className="text-[30px] text-wa-muted">₹</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1"))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                className="w-40 bg-transparent text-center text-[40px] font-semibold outline-none placeholder:text-wa-muted/60"
              />
            </div>
            <div className="flex gap-2 mt-3">
              {QUICK.map((q) => (
                <button key={q} onClick={() => setAmount(String(q))} className="flex-1 h-9 rounded-full border border-white/15 text-[13.5px] active:bg-white/10">
                  ₹{q}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
              placeholder="Add a note (optional)"
              className="mt-3 w-full h-12 rounded-xl bg-wa-field px-4 text-[14.5px] outline-none placeholder:text-wa-muted"
            />
            {cfg?.test && (
              <p className="mt-3 rounded-xl bg-[#E8A33D]/15 text-[#E8A33D] px-3 py-2 text-[12px] leading-snug">
                Test mode, no real money moves. Use card 4111 1111 1111 1111 (any future date, any CVV) or UPI <b>success@razorpay</b>.
              </p>
            )}
            <button onClick={pay} disabled={!valid || busy || !cfg} className="mt-4 w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {valid ? `Pay ₹${value.toLocaleString("en-IN")}` : "Enter an amount"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PaymentModal;
