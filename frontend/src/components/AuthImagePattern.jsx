import { MessageSquare, Lock, Zap } from "lucide-react";

const bubbles = [
  { text: "Hey! Are we still on for tonight? 🌙", mine: false, delay: "0s" },
  { text: "Always. Bringing the good playlist 🎧", mine: true, delay: "0.6s" },
  { text: "Perfect. Message me when you land ✈️", mine: false, delay: "1.2s" },
];

const AuthImagePattern = ({ title, subtitle }) => {
  return (
    <div className="auth-hero hidden lg:flex relative items-center justify-center overflow-hidden p-12 text-white">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <div className="auth-orb auth-orb-c" />
      <div className="auth-grid" />

      <div className="relative z-10 w-full max-w-md">
        <div className="space-y-3 mb-10">
          {bubbles.map((b, i) => (
            <div
              key={i}
              style={{ animationDelay: b.delay }}
              className={`auth-bubble ${b.mine ? "ml-auto bg-emerald-400/25" : "mr-auto bg-white/10"} max-w-[82%] rounded-2xl px-4 py-2.5 text-sm backdrop-blur-xl border border-white/15 shadow-xl`}
            >
              {b.text}
            </div>
          ))}
        </div>

        <h2 className="text-3xl font-semibold tracking-tight mb-3">{title}</h2>
        <p className="text-white/70 leading-relaxed">{subtitle}</p>

        <div className="mt-8 flex items-center gap-5 text-xs text-white/60">
          <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private by design</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Real-time</span>
          <span className="inline-flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Calls &amp; status</span>
        </div>
      </div>
    </div>
  );
};

export default AuthImagePattern;
