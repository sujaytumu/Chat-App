import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import AuthImagePattern from "../components/AuthImagePattern";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, MessageSquare, UserPlus, ShieldCheck } from "lucide-react";

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { login, isLoggingIn, pendingTwoFactor, verifyTwoFactor, cancelTwoFactor } = useAuthStore();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);

  const submitCode = async (e) => {
    e.preventDefault();
    const ok = await verifyTwoFactor(code.trim());
    if (!ok) setCode("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    login(formData);
  };

  return (
    <div className="h-screen grid lg:grid-cols-2">
      {/* Left Side - Form */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20
              transition-colors"
              >
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mt-2">Welcome Back</h1>
              <p className="text-base-content/60">Sign in to your account</p>
            </div>
          </div>

          {pendingTwoFactor ? (
            <form onSubmit={submitCode} className="space-y-6">
              <div className="text-center space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
                <h2 className="text-xl font-semibold">Two-step verification</h2>
                <p className="text-sm text-base-content/60">
                  {useBackup
                    ? "Enter one of your backup codes."
                    : "Enter the 6-digit code from your authenticator app."}
                </p>
              </div>
              <input
                autoFocus
                inputMode={useBackup ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={useBackup ? 11 : 7}
                className="input input-bordered w-full text-center text-2xl tracking-[0.35em]"
                placeholder={useBackup ? "XXXXX-XXXXX" : "000000"}
                value={code}
                onChange={(e) => setCode(useBackup ? e.target.value.toUpperCase() : e.target.value.replace(/[^\d ]/g, ""))}
              />
              <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn || code.trim().length < (useBackup ? 10 : 6)}>
                {isLoggingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" className="link" onClick={() => { setUseBackup((v) => !v); setCode(""); }}>
                  {useBackup ? "Use authenticator code" : "Use a backup code"}
                </button>
                <button type="button" className="link" onClick={() => { cancelTwoFactor(); setCode(""); setUseBackup(false); }}>
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
          <>
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Email</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type="email"
                  className={`input input-bordered w-full pl-10`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input input-bordered w-full pl-10`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-base-content/40" />
                  ) : (
                    <Eye className="h-5 w-5 text-base-content/40" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Highlighted Create Account Box */}
          <div className="mt-6">
            <Link
              to="/signup"
              className="block border-2 border-primary rounded-xl p-4 text-center shadow-md hover:shadow-xl hover:bg-primary/10 transition-all duration-300"
            >
              <div className="flex items-center justify-center gap-2 text-primary font-semibold">
                <UserPlus className="w-5 h-5" />
                Create New Account
              </div>
              <p className="text-sm text-base-content/60 mt-1">
                Join us today – it only takes a minute!
              </p>
            </Link>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Right Side - Image/Pattern */}
      <AuthImagePattern
        title={"Welcome back!"}
        subtitle={"Sign in to continue your conversations and catch up with your messages."}
      />
    </div>
  );
};
export default LoginPage;
