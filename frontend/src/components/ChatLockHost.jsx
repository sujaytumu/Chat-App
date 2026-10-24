import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Delete, Loader2, X } from "lucide-react";
import { useChatLockStore } from "../store/useChatLockStore";
import { useAuthStore } from "../store/useAuthStore";

const MIN = 4;
const MAX = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const PinDialog = ({ modal }) => {
  const closeModal = useChatLockStore((s) => s.closeModal);
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState(null); // create mode: the first entry, awaiting confirmation
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(0);

  const fail = (msg) => {
    setError(msg);
    setPin("");
    setShake((n) => n + 1);
    navigator.vibrate?.(60);
  };

  const submit = async () => {
    if (busy) return;
    if (pin.length < MIN) return fail(`Use at least ${MIN} digits`);
    if (modal.mode === "create") {
      if (first === null) {
        setFirst(pin);
        setPin("");
        setError("");
        return;
      }
      if (pin !== first) {
        setFirst(null);
        return fail("PINs didn't match — start again");
      }
    }
    setBusy(true);
    const result = await modal.submit(pin);
    setBusy(false);
    if (result !== true) fail(typeof result === "string" ? result : "Something went wrong");
  };

  const add = (d) => {
    if (busy) return;
    setError("");
    setPin((p) => (p.length < MAX ? p + d : p));
  };
  const del = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    if (forgot) return;
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) add(e.key);
      else if (e.key === "Backspace") del();
      else if (e.key === "Enter") submit();
      else if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = modal.mode === "create" && first !== null ? "Confirm your PIN" : modal.title;
  const subtitle = modal.mode === "create" && first !== null ? "Enter the same PIN once more" : modal.subtitle;

  const doReset = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    const r = await useChatLockStore.getState().resetWithPassword(password);
    setBusy(false);
    if (r !== true) {
      setError(typeof r === "string" ? r : "Something went wrong");
      setPassword("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && closeModal()}
    >
      <div className="relative w-full max-w-[330px] rounded-[28px] bg-wa-pop text-wa-text shadow-2xl p-6 pb-5">
        <button onClick={closeModal} className="absolute right-3 top-3 size-9 rounded-full flex items-center justify-center text-wa-icon hover:bg-wa-hover" aria-label="Close">
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="size-14 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)", boxShadow: "0 12px 28px -10px rgb(18 140 126 / .7)" }}>
            <Lock size={26} />
          </div>
          <h2 className="mt-3 text-[18px] font-semibold tracking-tight">{forgot ? "Forgot your PIN?" : title}</h2>
          <p className="mt-1 text-[13px] text-wa-muted leading-snug">
            {forgot ? "Enter your account password. This removes the PIN and unlocks all your chats." : subtitle}
          </p>
        </div>

        {forgot ? (
          <form onSubmit={doReset} className="mt-5 space-y-3">
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Account password"
              autoComplete="current-password"
              className="w-full rounded-xl bg-wa-field px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#25d366]/40"
            />
            {error && <p className="text-center text-[12.5px] text-red-500">{error}</p>}
            <button type="submit" disabled={!password || busy} className="w-full rounded-xl py-3 text-[14px] font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : "Remove chat lock"}
            </button>
            <button type="button" onClick={() => { setForgot(false); setError(""); }} className="w-full text-[13px] text-wa-muted py-1">
              Back
            </button>
          </form>
        ) : (
          <>
            <div key={shake} className="mt-5 flex justify-center gap-3 h-4" style={shake ? { animation: "pin-shake .35s" } : undefined}>
              {Array.from({ length: MAX }).map((_, i) => (
                <span key={i} className={`size-3.5 rounded-full border-2 transition-colors ${i < pin.length ? "bg-[#25d366] border-[#25d366]" : "border-wa-muted2"}`} />
              ))}
            </div>
            <p className="mt-3 h-4 text-center text-[12.5px] text-red-500">{error}</p>

            <div className="mt-2 grid grid-cols-3 gap-2.5 place-items-center">
              {KEYS.map((k) => (
                <button key={k} onClick={() => add(k)} className="size-[62px] rounded-full bg-wa-surface hover:bg-wa-hover active:scale-95 transition text-[22px]">
                  {k}
                </button>
              ))}
              <button onClick={del} className="size-[62px] rounded-full flex items-center justify-center text-wa-icon hover:bg-wa-hover active:scale-95 transition" aria-label="Delete">
                <Delete size={22} />
              </button>
              <button onClick={() => add("0")} className="size-[62px] rounded-full bg-wa-surface hover:bg-wa-hover active:scale-95 transition text-[22px]">0</button>
              <button onClick={submit} disabled={busy || pin.length < MIN} className="size-[62px] rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 transition" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }} aria-label="Continue">
                {busy ? <Loader2 size={22} className="animate-spin" /> : <span className="text-[24px] leading-none">→</span>}
              </button>
            </div>

            {modal.mode === "enter" && (
              <button onClick={() => { setForgot(true); setError(""); }} className="mt-4 w-full text-center text-[13px] text-[#128c7e] font-medium">
                Forgot PIN?
              </button>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes pin-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
    </div>
  );
};

// Mounted once in the main layout; shows the PIN dialog on request from anywhere.
const ChatLockHost = () => {
  const modal = useChatLockStore((s) => s.modal);
  const userId = useAuthStore((s) => s.authUser?._id);
  // Logging in / out always starts locked
  useEffect(() => {
    useChatLockStore.getState().reset();
  }, [userId]);
  if (!modal) return null;
  return createPortal(<PinDialog key={modal.title} modal={modal} />, document.body);
};

export default ChatLockHost;
