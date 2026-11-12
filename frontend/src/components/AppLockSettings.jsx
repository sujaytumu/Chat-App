import { useState } from "react";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Switch } from "./SettingsShell";
import PinPad from "./PinPad";
import { isAppLockOn, enableAppLock, disableAppLock, checkPin, getLockDelay, setLockDelay, LOCK_DELAYS } from "../lib/appLock";

// Privacy > App lock: turn the PIN on (typed twice) or off (needs the PIN), and choose when it asks again.
const AppLockSettings = () => {
  const [on, setOn] = useState(isAppLockOn);
  const [delay, setDelay] = useState(getLockDelay);
  const [step, setStep] = useState(null); // "new" | "confirm" | "off"
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setStep(null);
    setPin("");
    setFirst("");
    setError("");
  };
  const fail = (m) => {
    setError(m);
    setPin("");
    setShake((n) => n + 1);
    navigator.vibrate?.(60);
  };

  const submit = async () => {
    if (busy || pin.length < 4) return;
    if (step === "new") {
      setFirst(pin);
      setPin("");
      setStep("confirm");
      return;
    }
    if (step === "confirm") {
      if (pin !== first) {
        setStep("new");
        setFirst("");
        return fail("PINs didn't match. Start again.");
      }
      setBusy(true);
      try {
        await enableAppLock(pin, delay);
        setOn(true);
        toast.success("App lock is on");
        close();
      } catch {
        fail("This phone can't keep a PIN safely, so the lock wasn't turned on.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === "off") {
      setBusy(true);
      const ok = await checkPin(pin);
      setBusy(false);
      if (!ok) return fail("Wrong PIN");
      disableAppLock();
      setOn(false);
      toast.success("App lock is off");
      close();
    }
  };

  const title = step === "new" ? "Choose a PIN" : step === "confirm" ? "Confirm your PIN" : "Enter your PIN";
  const sub = step === "new" ? "4 to 6 digits" : step === "confirm" ? "Enter the same PIN once more" : "To turn off the app lock";

  return (
    <div className="rounded-xl bg-wa-surface p-4">
      <button type="button" role="switch" aria-checked={on} onClick={() => (on ? setStep("off") : setStep("new"))} className="w-full flex items-center gap-3 text-left">
        <Lock size={19} className="text-wa-icon shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] text-wa-text">App lock</span>
          <span className="block text-[11.5px] text-wa-muted mt-0.5">Ask for a PIN when you open Talkies. Kept only on this phone.</span>
        </span>
        <Switch checked={on} />
      </button>
      {on && (
        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-wa-muted">Ask for the PIN</span>
          <select
            value={delay}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDelay(v);
              setLockDelay(v);
            }}
            className="bg-wa-field text-wa-text rounded-lg px-3 py-2 text-[12.5px]"
          >
            {LOCK_DELAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </label>
      )}
      {step && (
        <div className="fixed inset-0 z-[185] bg-black/60 flex items-center justify-center p-4" onClick={close}>
          <div className="w-full max-w-[330px] rounded-[28px] bg-wa-pop text-wa-text shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-[18px] font-semibold">{title}</h3>
            <p className="mt-1 text-center text-[13px] text-wa-muted">{sub}</p>
            <PinPad pin={pin} onChange={(p) => { setPin(p); setError(""); }} onSubmit={submit} disabled={busy} shake={shake} />
            <p className="mt-3 min-h-4 text-center text-[12.5px] text-red-500">{error}</p>
            <button type="button" onClick={close} className="mt-1 w-full text-center text-[13px] text-wa-muted py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLockSettings;
