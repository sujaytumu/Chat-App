import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ShieldCheck, Delete, Check, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import { loadRazorpay } from "../lib/razorpay";
import Avatar from "./Avatar";

const QUICK = [10, 50, 100, 500];
const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// 6-digit PIN entry with a number pad (like a UPI PIN screen). Calls onComplete(pin) on the 6th digit.
const PinPad = ({ title, subtitle, error, busy, shake, onComplete }) => {
  const [pin, setPin] = useState("");
  const done = useRef(false);

  // A wrong PIN clears the dots so it can be typed again.
  useEffect(() => {
    if (error) {
      setPin("");
      done.current = false;
    }
  }, [error, shake]);

  const press = (d) => {
    if (busy || done.current) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) {
      done.current = true;
      onComplete(next);
    }
  };
  const back = () => {
    if (busy) return;
    done.current = false;
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center">
      <span className="size-12 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center mb-3">
        <Lock size={22} />
      </span>
      <h3 className="text-[18px] font-semibold text-center">{title}</h3>
      {subtitle && <p className="text-[13.5px] text-wa-muted text-center mt-1 px-4">{subtitle}</p>}
      <div key={shake} className={`flex gap-3.5 my-6 ${shake ? "pin-shake" : ""}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`size-3.5 rounded-full border-2 transition-colors ${i < pin.length ? "bg-[#25D366] border-[#25D366]" : error ? "border-[#F15C6D]" : "border-wa-muted/60"}`} />
        ))}
      </div>
      <p className={`h-5 text-[13px] text-center ${error ? "text-[#F15C6D]" : "text-transparent"}`}>{error || "."}</p>
      <div className="grid grid-cols-3 gap-x-8 gap-y-2 mt-2 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => press(String(d))} className="h-14 rounded-full text-[24px] active:bg-white/10">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => press("0")} className="h-14 rounded-full text-[24px] active:bg-white/10">
          0
        </button>
        <button onClick={back} aria-label="Delete" className="h-14 rounded-full flex items-center justify-center active:bg-white/10 text-wa-muted">
          {busy ? <Loader2 size={22} className="animate-spin" /> : <Delete size={24} />}
        </button>
      </div>
    </div>
  );
};

// "Pay": send money to the person through Razorpay, authorised with their own 6-digit PIN.
// Steps: amount → pin (or create + confirm the first time) → Razorpay window → result.
const PaymentModal = ({ user, onClose, onDone }) => {
  useBackToClose(true, onClose);
  const authUser = useAuthStore((s) => s.authUser);
  const [cfg, setCfg] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState("amount"); // amount | create | confirm | pin | result
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [shake, setShake] = useState(0);
  const [firstPin, setFirstPin] = useState("");
  const [result, setResult] = useState(null); // { ok, amount, id, at, reason }

  useEffect(() => {
    axiosInstance.get("/payments/config").then((r) => setCfg(r.data)).catch(() => setCfg({ enabled: false }));
  }, []);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= (cfg?.min || 1) && value <= (cfg?.max || 100000);

  const wrongPin = (msg) => {
    setPinError(msg);
    setShake((n) => n + 1);
  };

  // Amount chosen: ask for the PIN (or make one the first time).
  const next = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await axiosInstance.get("/payments/pin");
      setPinError("");
      setStep(r.data?.set ? "pin" : "create");
    } catch {
      setResult({ ok: false, amount: value, reason: "Couldn't reach the server. Check your internet and try again." });
      setStep("result");
    }
    setBusy(false);
  };

  const onCreate = (p) => {
    setFirstPin(p);
    setPinError("");
    setStep("confirm");
  };
  const onConfirm = async (p) => {
    if (p !== firstPin) {
      setFirstPin("");
      setStep("create");
      wrongPin("The PINs didn't match. Try again.");
      return;
    }
    setBusy(true);
    try {
      await axiosInstance.post("/payments/pin", { pin: p });
      await startCheckout(p);
    } catch (e) {
      setFirstPin("");
      setStep("create");
      wrongPin(e.response?.data?.error || "Couldn't save your PIN");
      setBusy(false);
    }
  };

  const startCheckout = async (pin) => {
    setBusy(true);
    let order;
    try {
      const [Razorpay, res] = await Promise.all([loadRazorpay(), axiosInstance.post("/payments/order", { toUserId: user._id, amount: value, note, pin })]);
      order = res.data;
      try { localStorage.setItem("talkies-pay-return", String(user._id)); } catch { /* optional */ }
      const inApp = !!window.Capacitor?.isNativePlatform?.() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Talkies Pay",
        description: `Pay ${user.fullName}${note.trim() ? ` · ${note.trim()}` : ""}`,
        // No phone / saved bank is passed in: Razorpay's test mode only accepts its TEST card and bank pages, so a real
        // saved account (or a real UPI app) would always fail with "Payment could not be completed".
        prefill: { name: authUser?.fullName || "", contact: "", email: "" },
        remember_customer: false,
        method: { card: true, upi: false, netbanking: true, wallet: false, emi: false, paylater: false }, // test payments: test card or the test bank page
        theme: { color: "#25D366" },
        // Inside the Android app (and phone browsers) bank / OTP pages can't open in a pop-up and show a blank page,
        // so there the whole screen goes to Razorpay and comes back to the app when finished.
        ...(inApp
          ? { redirect: true, callback_url: `${window.location.origin}/api/payments/callback`, cancel_url: `${window.location.origin}/?pay=cancelled` }
          : {}),
        modal: {
          ondismiss: () => {
            axiosInstance.post("/payments/cancel", { orderId: order.orderId }).catch(() => {});
            setBusy(false);
            setStep("amount"); // closed the Razorpay window: nothing was charged
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
            onDone?.();
            setResult({ ok: true, amount: value, id: response.razorpay_payment_id, at: new Date() });
          } catch (e) {
            setResult({ ok: false, amount: value, reason: e.response?.data?.error || "We couldn't confirm the payment. If money was taken it will be refunded." });
          }
          setStep("result");
          setBusy(false);
        },
      });
      // Redirect mode: the payment page may open outside the app. When the person switches back to Talkies (or every few
      // seconds), ask the server how it went and show the result right here: no need for the browser's "back" button.
      if (inApp) {
        let done = false;
        let timer = null;
        let onVis = null;
        const cleanup = () => {
          clearInterval(timer);
          if (onVis) document.removeEventListener("visibilitychange", onVis);
        };
        const check = async () => {
          if (done) return;
          try {
            const { data } = await axiosInstance.get(`/payments/status/${order.orderId}`);
            if (data.status === "paid") {
              done = true;
              cleanup();
              try { rzp.close(); } catch { /* already closed */ }
              onDone?.();
              setResult({ ok: true, amount: value, id: order.orderId, at: new Date() });
              setStep("result");
              setBusy(false);
            } else if (data.status === "failed") {
              done = true;
              cleanup();
              setResult({ ok: false, amount: value, reason: "The payment could not be completed. Please try again." });
              setStep("result");
              setBusy(false);
            }
          } catch { /* try again */ }
        };
        onVis = () => document.visibilityState === "visible" && check();
        timer = setInterval(check, 3000);
        document.addEventListener("visibilitychange", onVis);
        setTimeout(() => !done && cleanup(), 15 * 60 * 1000);
      }
      rzp.on("payment.failed", (resp) => {
        axiosInstance.post("/payments/cancel", { orderId: order.orderId, error: resp?.error }).catch(() => {});
        setResult({ ok: false, amount: value, reason: resp?.error?.description || "The payment could not be completed. Please try another method." });
        setStep("result");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      const d = e.response?.data;
      if (d?.needsPin) {
        setStep("create");
      } else if (d?.attemptsLeft != null) {
        setStep("pin");
        wrongPin(`Wrong PIN · ${d.attemptsLeft} ${d.attemptsLeft === 1 ? "try" : "tries"} left`);
      } else if (d?.locked) {
        setStep("pin");
        wrongPin(d.error);
      } else {
        setResult({ ok: false, amount: value, reason: d?.error || e.message || "Couldn't start the payment" });
        setStep("result");
      }
      setBusy(false);
    }
  };

  const header = (title) => (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
        <X size={22} />
      </button>
    </div>
  );

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end sm:items-center justify-center" onClick={step === "amount" ? onClose : undefined}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-wa-panel text-wa-text p-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {step === "amount" && (
          <>
            {header("Send money")}
            <div className="flex items-center gap-3 mb-4">
              <Avatar src={user.profilePic} name={user.fullName} size="size-12" textSize="text-lg" />
              <div className="min-w-0">
                <p className="text-[15.5px] font-medium truncate">{user.fullName}</p>
                <p className="text-[12px] text-wa-muted flex items-center gap-1">
                  <ShieldCheck size={12} /> Talkies Pay · secured by Razorpay
                </p>
              </div>
            </div>

            {cfg && !cfg.enabled ? (
              <p className="rounded-2xl bg-wa-field px-4 py-4 text-[14px] text-wa-muted">
                {cfg.liveBlocked
                  ? "Payments here are test-mode only (play money). The server is using live Razorpay keys, which are refused — put the rzp_test_ key and its secret on the server."
                  : "Payments aren't switched on yet. The server needs its Razorpay test keys."}
              </p>
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
                    Test mode only: no real money moves, and your real card, UPI or bank will NOT work. Choose <b>Cards</b> and use Mastercard <b>5267 3181 8797 5449</b> (any future date, any CVV, any name). On the bank/OTP page tap <b>Success</b>.
                    <button type="button" onClick={() => { try { navigator.clipboard?.writeText("5267318187975449"); toast.success("Test card number copied"); } catch { /* ignore */ } }} className="ml-1 underline font-medium">Copy card number</button>
                  </p>
                )}
                <button onClick={next} disabled={!valid || busy || !cfg} className="mt-4 w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  {valid ? `Pay ${rupees(value)}` : "Enter an amount"}
                </button>
              </>
            )}
          </>
        )}

        {(step === "create" || step === "confirm" || step === "pin") && (
          <>
            <div className="flex justify-between mb-1">
              <button onClick={() => { setPinError(""); setStep("amount"); }} className="text-[14px] text-wa-muted px-1 py-1" disabled={busy}>
                Back
              </button>
              <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted" disabled={busy}>
                <X size={22} />
              </button>
            </div>
            {step === "create" && <PinPad key="create" title="Create your payment PIN" subtitle="Choose 6 digits. You'll enter it to approve every payment." error={pinError} shake={shake} onComplete={onCreate} />}
            {step === "confirm" && <PinPad key="confirm" title="Confirm your PIN" subtitle="Enter the same 6 digits again." error={pinError} busy={busy} shake={shake} onComplete={onConfirm} />}
            {step === "pin" && <PinPad key={`pin${shake}`} title="Enter your PIN" subtitle={`To pay ${rupees(value)} to ${user.fullName}`} error={pinError} busy={busy} shake={shake} onComplete={startCheckout} />}
          </>
        )}

        {step === "result" && result && (
          <div className="flex flex-col items-center text-center pt-4 pb-2">
            <div className="relative size-24 mb-5">
              <span className={`pay-ring absolute inset-0 rounded-full ${result.ok ? "bg-[#25D366]" : "bg-[#F15C6D]"}`} />
              <span className={`pay-pop relative size-24 rounded-full flex items-center justify-center text-white ${result.ok ? "bg-[#25D366]" : "bg-[#F15C6D]"}`}>
                {result.ok ? <Check size={52} strokeWidth={3} /> : <X size={52} strokeWidth={3} />}
              </span>
            </div>
            <p className="text-[34px] font-semibold leading-tight">{rupees(result.amount)}</p>
            <p className="text-[16px] mt-1">{result.ok ? `Paid to ${user.fullName}` : "Payment failed"}</p>
            {result.ok ? (
              <div className="w-full mt-6 rounded-2xl bg-wa-field px-4 py-3 text-left text-[13px] space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Date</span>
                  <span>{result.at.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Payment ID</span>
                  <span className="truncate">{result.id}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Method</span>
                  <span>Razorpay{cfg?.test ? " (test)" : ""}</span>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-wa-muted mt-3 px-3">{result.reason}</p>
            )}
            {result.ok && cfg?.test && <p className="text-[12px] text-wa-muted mt-3">Test payment: no real money moved.</p>}
            <div className="w-full mt-6 flex gap-3">
              {!result.ok && (
                <button onClick={() => { setResult(null); setStep("amount"); }} className="flex-1 h-12 rounded-full border border-white/20 font-medium active:bg-white/10">
                  Try again
                </button>
              )}
              <button onClick={onClose} className="flex-1 h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PaymentModal;
