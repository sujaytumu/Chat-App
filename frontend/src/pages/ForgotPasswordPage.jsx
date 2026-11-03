import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, KeyRound, Loader2, Lock, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import AuthImagePattern from "../components/AuthImagePattern";

// Forgot password, in three steps: email -> 6-digit code from the email -> new password.
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

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (error, fallback) => toast.error(error.response?.data?.message || fallback);

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!email.trim()) return toast.error("Enter your email");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/forgot-password", { email: email.trim() });
      toast.success("If that email has an account, a code is on its way");
      setCode("");
      setStep("code");
      setCooldown(60);
    } catch (error) {
      fail(error, "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await axiosInstance.post("/auth/forgot-password/verify", { email: email.trim(), otp: code.trim() });
      setResetToken(res.data.resetToken);
      setStep("password");
    } catch (error) {
      fail(error, "That code didn't work");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("The two passwords don't match");
    setBusy(true);
    try {
      await axiosInstance.post("/auth/forgot-password/reset", { resetToken, newPassword: password });
      toast.success("Password changed. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (error) {
      fail(error, "Couldn't change the password");
      if (/timed out/i.test(error.response?.data?.message || "")) setStep("email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-form min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div className="auth-logo w-14 h-14 rounded-2xl flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl font-semibold tracking-tight mt-3">Reset password</h1>
              <p className="text-base-content/60">
                {step === "email" && "We'll email you a 6-digit code"}
                {step === "code" && "Enter the code we emailed you"}
                {step === "password" && "Choose a new password"}
              </p>
            </div>
          </div>

          {step === "email" && (
            <form onSubmit={sendCode} className="space-y-6">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Email</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-base-content/40" />
                  </div>
                  <input
                    autoFocus
                    type="email"
                    autoComplete="email"
                    className="input input-bordered w-full pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode} className="space-y-6">
              <div className="text-center space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
                <p className="text-sm text-base-content/60">
                  Sent to <span className="font-medium text-base-content">{email.trim()}</span>. It works for 10 minutes.
                </p>
              </div>
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="input input-bordered w-full text-center text-2xl tracking-[0.35em]"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
              />
              <button type="submit" className="btn btn-primary w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify code"}
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" className="link" disabled={busy || cooldown > 0} onClick={sendCode}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); }}>
                  Change email
                </button>
              </div>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={savePassword} className="space-y-6">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">New password</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-base-content/40" />
                  </div>
                  <input
                    autoFocus
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="input input-bordered w-full pl-10"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-5 w-5 text-base-content/40" /> : <Eye className="h-5 w-5 text-base-content/40" />}
                  </button>
                </div>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Confirm new password</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-base-content/40" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="input input-bordered w-full pl-10"
                    placeholder="Type it again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Change password"}
              </button>
            </form>
          )}

          <p className="text-center text-sm">
            <Link to="/login" className="link link-primary">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>

      <AuthImagePattern title={"Locked out?"} subtitle={"Get a code by email, choose a new password and jump back into your chats."} />
    </div>
  );
};
export default ForgotPasswordPage;
