import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ShieldCheck, Delete, Check, Lock, Smartphone } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
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

// "Pay": send money to the person. Amount → 6-digit PIN → paid (or "Wrong PIN"). Play money in test mode.
// First time: create + confirm the PIN, and add the mobile number that gets payment text messages.
const PaymentModal = ({ user, onClose, onDone }) => {
  useBackToClose(true, onClose);
  const [cfg, setCfg] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState("amount"); // amount | create | confirm | phone | pin | working | result
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [shake, setShake] = useState(0);
  const [firstPin, setFirstPin] = useState("");
  const [phone, setPhone] = useState(""); // number typed during setup
  const [savedPhone, setSavedPhone] = useState(""); // number already on file
  const [result, setResult] = useState(null); // { ok, amount, id, at, reason }

  useEffect(() => {
    axiosInstance.get("/payments/config").then((r) => setCfg(r.data)).catch(() => setCfg({ enabled: true }));
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
      setSavedPhone(r.data?.phone || "");
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
  const onConfirm = (p) => {
    if (p !== firstPin) {
      setFirstPin("");
      setStep("create");
      wrongPin("The PINs didn't match. Try again.");
      return;
    }
    setStep("phone");
  };

  // Saves the new PIN (and number), then pays with it.
  const finishSetup = async (withPhone) => {
    setBusy(true);
    try {
      await axiosInstance.post("/payments/pin", { pin: firstPin, ...(withPhone ? { phone } : {}) });
      if (withPhone) setSavedPhone(phone);
      await send(firstPin);
    } catch (e) {
      setBusy(false);
      if (e.response?.status === 400 && /mobile/i.test(e.response?.data?.error || "")) {
        setPinError(e.response.data.error);
        return;
      }
      setFirstPin("");
      setStep("create");
      wrongPin(e.response?.data?.error || "Couldn't save your PIN");
    }
  };

  const send = async (pin) => {
    setBusy(true);
    setStep("working");
    const started = Date.now();
    try {
      const res = await axiosInstance.post("/payments/send", { toUserId: user._id, amount: value, note, pin });
      const msg = res.data?.message;
      if (msg) {
        const st = useChatStore.getState();
        if (st.selectedChat?.type === "direct" && String(st.selectedChat.data._id) === String(user._id) && !st.messages.some((m) => m._id === msg._id)) {
          useChatStore.setState({ messages: [...st.messages, msg] });
        }
      }
      await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - started)))); // a moment of "processing"
      onDone?.();
      setResult({ ok: true, amount: value, id: res.data?.paymentId, at: new Date(res.data?.paidAt || Date.now()) });
      setStep("result");
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
        setResult({ ok: false, amount: value, reason: d?.error || "Couldn't complete the payment. Try again." });
        setStep("result");
      }
    }
    setBusy(false);
  };

  const header = (title) => (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
        <X size={22} />
      </button>
    </div>
  );

  const phoneOk = /^[6-9]\d{9}$/.test(phone);
  const showBack = step === "create" || step === "confirm" || step === "pin" || step === "phone";

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
                  <ShieldCheck size={12} /> Talkies Pay · approved with your PIN
                </p>
              </div>
            </div>
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
            <p className="mt-3 rounded-xl bg-[#E8A33D]/15 text-[#E8A33D] px-3 py-2 text-[12px] leading-snug">Test payment: play money, no real money moves.</p>
            <button onClick={next} disabled={!valid || busy || !cfg} className="mt-4 w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {valid ? `Send ${rupees(value)}` : "Enter an amount"}
            </button>
          </>
        )}

        {showBack && (
          <div className="flex justify-between mb-1">
            <button onClick={() => { setPinError(""); setStep("amount"); }} className="text-[14px] text-wa-muted px-1 py-1" disabled={busy}>
              Back
            </button>
            <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted" disabled={busy}>
              <X size={22} />
            </button>
          </div>
        )}

        {step === "create" && <PinPad key={`create${shake}`} title="Create your payment PIN" subtitle="Choose 6 digits. You'll enter it to approve every payment." error={pinError} shake={shake} onComplete={onCreate} />}
        {step === "confirm" && <PinPad key="confirm" title="Confirm your PIN" subtitle="Enter the same 6 digits again." error={pinError} shake={shake} onComplete={onConfirm} />}
        {step === "pin" && <PinPad key={`pin${shake}`} title="Enter your PIN" subtitle={`To send ${rupees(value)} to ${user.fullName}`} error={pinError} shake={shake} onComplete={send} />}

        {step === "phone" && (
          <div className="flex flex-col items-center">
            <span className="size-12 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center mb-3">
              <Smartphone size={22} />
            </span>
            <h3 className="text-[18px] font-semibold text-center">Your mobile number</h3>
            <p className="text-[13.5px] text-wa-muted text-center mt-1 px-4">We'll text you when money is sent or received, with the amount and a reference.</p>
            <div className="mt-5 w-full flex items-center gap-2 rounded-xl bg-wa-field px-4 h-14">
              <span className="text-[16px] text-wa-muted">+91</span>
              <input
                value={phone}
                onChange={(e) => {
                  setPinError("");
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                }}
                inputMode="tel"
                placeholder="10-digit mobile number"
                autoFocus
                className="flex-1 bg-transparent text-[17px] outline-none placeholder:text-wa-muted/70 tracking-wide"
              />
            </div>
            <p className={`h-5 mt-2 text-[13px] ${pinError ? "text-[#F15C6D]" : "text-transparent"}`}>{pinError || "."}</p>
            <button onClick={() => finishSetup(true)} disabled={!phoneOk || busy} className="mt-2 w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
              {busy && <Loader2 size={18} className="animate-spin" />} Save and send {rupees(value)}
            </button>
            <button onClick={() => finishSetup(false)} disabled={busy} className="mt-2 h-10 text-[14px] text-wa-muted">
              Skip for now
            </button>
          </div>
        )}

        {step === "working" && (
          <div className="flex flex-col items-center text-center py-12">
            <Loader2 size={44} className="animate-spin text-[#25D366]" />
            <p className="text-[17px] font-medium mt-5">Sending {rupees(value)}…</p>
            <p className="text-[13px] text-wa-muted mt-1">Verifying your PIN</p>
          </div>
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
            <p className="text-[16px] mt-1">{result.ok ? `Sent to ${user.fullName}` : "Payment failed"}</p>
            {result.ok ? (
              <div className="w-full mt-6 rounded-2xl bg-wa-field px-4 py-3 text-left text-[13px] space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Date</span>
                  <span>{result.at.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Reference</span>
                  <span className="truncate">{result.id}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-wa-muted">Type</span>
                  <span>Test payment</span>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-wa-muted mt-3 px-3">{result.reason}</p>
            )}
            {result.ok && cfg?.sms && (savedPhone || phone) && <p className="text-[12px] text-wa-muted mt-3">A text message was sent to +91 {(savedPhone || phone).replace("+91", "")}.</p>}
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
