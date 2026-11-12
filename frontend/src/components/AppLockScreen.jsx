import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useAppLockStore, checkPin, waitSeconds, disableAppLock, watchAppLock, isAppLockOn, syncAppLockFlag } from "../lib/appLock";
import { useAuthStore } from "../store/useAuthStore";
import PinPad from "./PinPad";

// Covers the app until the PIN is entered. Sits below the incoming-call screen, so a call can still be answered.
const AppLockScreen = () => {
  const locked = useAppLockStore((s) => s.locked);
  const logout = useAuthStore((s) => s.logout);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    watchAppLock();
    syncAppLockFlag(); // keeps the server's copy right even if an earlier save didn't get through
  }, []);

  useEffect(() => {
    if (!locked) {
      setPin("");
      setError("");
      setConfirmOut(false);
    }
  }, [locked]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait(waitSeconds()), 500);
    return () => clearInterval(t);
  }, [wait]);

  // The lock was removed from another screen (or the stored copy vanished): never trap anyone behind it.
  useEffect(() => {
    if (locked && !isAppLockOn()) disableAppLock();
  }, [locked]);

  if (!locked) return null;

  const submit = async () => {
    if (busy || pin.length < 4 || wait > 0) return;
    setBusy(true);
    const ok = await checkPin(pin);
    setBusy(false);
    if (ok) return;
    setPin("");
    setShake((n) => n + 1);
    navigator.vibrate?.(60);
    const w = waitSeconds();
    if (w > 0) {
      setWait(w);
      setError("");
    } else {
      setError("Wrong PIN");
    }
  };

  const signOut = async () => {
    disableAppLock();
    await logout();
  };

  return (
    <div className="fixed inset-0 z-[190] bg-wa-bg text-wa-text flex flex-col items-center justify-center p-6" role="dialog" aria-label="App locked">
      <div className="size-16 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)", boxShadow: "0 12px 28px -10px rgb(18 140 126 / .7)" }}>
        <Lock size={30} />
      </div>
      <h2 className="mt-4 text-[20px] font-semibold tracking-tight">Talkies is locked</h2>
      <p className="mt-1 text-[13px] text-wa-muted">Enter your PIN to open the app</p>
      <div className="w-full max-w-[300px]">
        <PinPad pin={pin} onChange={(p) => { setPin(p); setError(""); }} onSubmit={submit} disabled={busy || wait > 0} shake={shake} />
        <p className="mt-3 h-4 text-center text-[12.5px] text-red-500">{wait > 0 ? `Too many tries. Wait ${wait} s.` : error}</p>
        {!confirmOut ? (
          <button type="button" onClick={() => setConfirmOut(true)} className="mt-3 w-full text-center text-[13px] text-[#128c7e] font-medium">
            Forgot PIN?
          </button>
        ) : (
          <div className="mt-3 text-center text-[12.5px] text-wa-muted">
            <p>Signing out removes the lock. You&apos;ll need your account password to sign back in.</p>
            <div className="mt-2 flex justify-center gap-4">
              <button type="button" onClick={() => setConfirmOut(false)} className="text-wa-text">Cancel</button>
              <button type="button" onClick={signOut} className="text-red-500 font-medium">Sign out</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppLockScreen;
