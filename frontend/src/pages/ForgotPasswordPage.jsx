import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, MailCheck, MessageSquare, ShieldCheck } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import AuthImagePattern from "../components/AuthImagePattern";

// Forgot password, in three calm steps:  1 email  ->  2 six-digit code from the email  ->  3 new password.
// If the email can't reach someone, the owner can reset it for them, and the owner has a recovery key as a last resort.
const maskEmail = (e) => {
  const [u = "", d = ""] = e.trim().split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
};
const strengthOf = (p) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
};
const STRENGTH = [
  ["Too short", "bg-error"],
  ["Weak", "bg-error"],
  ["Okay", "bg-warning"],
  ["Good", "bg-success"],
  ["Strong", "bg-success"],
];

const Steps = ({ step }) => {
  const idx = ["email", "code", "password"].indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-label={`Step ${idx + 1} of 3`}>
      {["Email", "Code", "Password"].map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span className={`size-7 rounded-full text-[12.5px] font-semibold flex items-center justify-center transition-colors ${i < idx ? "bg-primary text-primary-content" : i === idx ? "bg-primary text-primary-content ring-4 ring-primary/20" : "bg-base-300 text-base-content/50"}`}>
            {i < idx ? <Check size={15} /> : i + 1}
          </span>
          <span className={`text-[13px] hidden sm:inline ${i === idx ? "font-semibold" : "text-base-content/50"}`}>{label}</span>
          {i < 2 && <span className={`w-6 sm:w-8 h-0.5 rounded ${i < idx ? "bg-primary" : "bg-base-300"}`} />}
        </div>
      ))}
    </div>
  );
};

// Six boxes that behave like one field: typing, deleting, pasting and the phone's "autofill code" all work.
const CodeBoxes = ({ value, onChange, disabled, autoFocus }) => {
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative" onClick={() => input.current?.focus()}>
      <div className="flex justify-between gap-2 sm:gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-14 sm:h-16 rounded-xl border-2 flex items-center justify-center text-2xl sm:text-3xl font-semibold transition-colors ${
              focused && i === Math.min(value.length, 5) ? "border-primary bg-primary/5" : value[i] ? "border-base-content/30" : "border-base-300"
            }`}
          >
            {value[i] || (focused && i === value.length ? <span className="w-0.5 h-7 bg-primary animate-pulse" /> : "")}
          </div>
        ))}
      </div>
      <input
        ref={input}
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        maxLength={12}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ fontSize: 16 }}
      />
    </div>
  );
};

const ForgotPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // "email" | "code" | "password"
  const [email, setEmail] = useState(location.state?.email || "");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState({ open: false, key: "", password: "" });

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Came from a failed sign-in with the email filled in: send the code straight away.
  useEffect(() => {
    if (location.state?.auto && email.trim()) sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (e, fallback) => {
    const msg = e.response?.data?.message || (e.code === "ERR_NETWORK" ? "No connection. Check your internet and try again." : fallback);
    setError(msg);
    return msg;
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) return setError("Enter the email you signed up with");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/forgot-password", { email: email.trim() });
      setCode("");
      setStep("code");
      setCooldown(60);
    } catch (err) {
      fail(err, "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await axiosInstance.post("/auth/forgot-password/verify", { email: email.trim(), otp: value });
      setResetToken(res.data.resetToken);
      setStep("password");
    } catch (err) {
      fail(err, "That code did not work");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("The two passwords do not match");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/forgot-password/reset", { resetToken, newPassword: password });
      toast.success("Password changed. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      const msg = fail(err, "Couldn't change the password");
      if (/timed out/i.test(msg)) setStep("email");
    } finally {
      setBusy(false);
    }
  };

  const useRecoveryKey = async (e) => {
    e.preventDefault();
    setError("");
    if (recovery.password.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/owner-recovery", { key: recovery.key.trim(), newPassword: recovery.password });
      toast.success("Owner password changed. Sign in with it.");
      navigate("/login", { replace: true });
    } catch (err) {
      fail(err, "That recovery key did not work");
    } finally {
      setBusy(false);
    }
  };

  const strength = strengthOf(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const titles = {
    email: ["Forgot your password?", "Enter your email and we will send you a 6-digit code."],
    code: ["Check your email", ""],
    password: ["Choose a new password", "Pick something you will remember. You will be signed out everywhere else."],
  };

  return (
    <div className="auth-form min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="auth-logo w-14 h-14 rounded-2xl flex items-center justify-center mx-auto">
              {step === "code" ? <MailCheck className="w-7 h-7 text-white" /> : step === "password" ? <ShieldCheck className="w-7 h-7 text-white" /> : <MessageSquare className="w-7 h-7 text-white" />}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-4">{titles[step][0]}</h1>
            <p className="text-base-content/60 mt-1.5 text-[15px] leading-snug">
              {step === "code" ? (<>We sent a code to <span className="font-medium text-base-content">{maskEmail(email)}</span>. It works for 10 minutes.</>) : titles[step][1]}
            </p>
          </div>

          <Steps step={step} />

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error/10 px-3.5 py-3 text-[14px] text-error">
              <AlertCircle className="h-5 w-5 shrink-0 mt-px" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {step === "email" && !recovery.open && (
            <form onSubmit={sendCode} className="space-y-5">
              <div className="form-control">
                <label className="label"><span className="label-text font-medium">Email</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-base-content/40" /></div>
                  <input autoFocus type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" className="input input-bordered w-full pl-10" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send code"}
              </button>
              <p className="text-center text-[13px] text-base-content/55 leading-snug">Not getting the email? Ask the owner of the app to reset your password for you.</p>
            </form>
          )}

          {step === "code" && (
            <div className="space-y-6">
              <CodeBoxes
                value={code}
                disabled={busy}
                autoFocus
                onChange={(v) => {
                  setCode(v);
                  setError("");
                  if (v.length === 6) verifyCode(v);
                }}
              />
              <button type="button" className="btn btn-primary w-full" disabled={busy || code.length < 6} onClick={() => verifyCode()}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify code"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="link" disabled={busy || cooldown > 0} onClick={sendCode}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Change email</button>
              </div>
              <p className="text-center text-[12.5px] text-base-content/50">Check your spam folder if it does not show up within a minute.</p>
            </div>
          )}

          {step === "password" && (
            <form onSubmit={savePassword} className="space-y-5">
              <div className="form-control">
                <label className="label"><span className="label-text font-medium">New password</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-base-content/40" /></div>
                  <input autoFocus type={showPassword ? "text" : "password"} autoComplete="new-password" className="input input-bordered w-full pl-10 pr-11" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-5 w-5 text-base-content/40" /> : <Eye className="h-5 w-5 text-base-content/40" />}
                  </button>
                </div>
                {password && (
                  <div className="mt-2.5">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${strength >= n ? STRENGTH[strength][1] : "bg-base-300"}`} />)}
                    </div>
                    <p className="mt-1 text-[12.5px] text-base-content/60">{STRENGTH[strength][0]}{password.length < 8 ? ` - ${8 - password.length} more character${8 - password.length === 1 ? "" : "s"} needed` : ""}</p>
                  </div>
                )}
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text font-medium">Confirm new password</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><KeyRound className="h-5 w-5 text-base-content/40" /></div>
                  <input type={showPassword ? "text" : "password"} autoComplete="new-password" className={`input input-bordered w-full pl-10 ${mismatch ? "input-error" : ""}`} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {mismatch && <p className="mt-1.5 text-[12.5px] text-error">The two passwords do not match yet.</p>}
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy || password.length < 8 || password !== confirm}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Change password"}
              </button>
            </form>
          )}

          {step === "email" && (
            <div className="mt-6">
              {!recovery.open ? (
                <button type="button" className="mx-auto block text-[13px] text-base-content/50 underline underline-offset-2" onClick={() => { setRecovery({ ...recovery, open: true }); setError(""); }}>
                  I am the owner and have a recovery key
                </button>
              ) : (
                <form onSubmit={useRecoveryKey} className="space-y-4 rounded-2xl border border-base-300 p-4">
                  <p className="text-[13.5px] font-medium flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Owner recovery</p>
                  <p className="text-[12.5px] text-base-content/60 leading-snug">The recovery key is saved in your hosting settings (Render, OWNER_RECOVERY_KEY). It only works for the owner account.</p>
                  <input type="password" autoComplete="off" className="input input-bordered w-full" placeholder="Recovery key" value={recovery.key} onChange={(e) => setRecovery({ ...recovery, key: e.target.value })} />
                  <input type="password" autoComplete="new-password" className="input input-bordered w-full" placeholder="New password (8+ characters)" value={recovery.password} onChange={(e) => setRecovery({ ...recovery, password: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-ghost flex-1" onClick={() => setRecovery({ open: false, key: "", password: "" })}>Cancel</button>
                    <button type="submit" className="btn btn-primary flex-1" disabled={busy || !recovery.key || recovery.password.length < 8}>
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <p className="text-center text-sm mt-7">
            <Link to="/login" className="link link-primary inline-flex items-center gap-1.5"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
          </p>
        </div>
      </div>

      <AuthImagePattern title={"Locked out?"} subtitle={"Get a code by email, choose a new password and jump back into your chats."} />
    </div>
  );
};
export default ForgotPasswordPage;
