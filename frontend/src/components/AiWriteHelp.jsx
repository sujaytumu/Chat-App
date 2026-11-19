import { useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";

const TONES = [
  { id: "fix", label: "Fix spelling" },
  { id: "friendly", label: "Friendlier" },
  { id: "formal", label: "More formal" },
  { id: "shorter", label: "Shorter" },
];

// "✨ Improve" above the message box: AI rewrites what you typed, you see it first and choose to use it.
// Only the draft you tap Improve on is sent to the server's AI.
const AiWriteHelp = ({ text, onUse }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const run = async (tone) => {
    setBusy(tone);
    setError("");
    setResult("");
    try {
      const { data } = await axiosInstance.post("/ai/rewrite", { text, tone });
      setResult(data.text || "");
    } catch (e) {
      setError(e?.response?.data?.error || "Couldn't improve it. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-wa-pop px-3 py-1.5 text-[13px] text-wa-text active:scale-95 transition-transform"
      >
        <Sparkles size={14} className="text-[#00A884]" /> Improve with AI
      </button>
    );

  return (
    <div className="mb-2 rounded-xl bg-wa-pop shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <Sparkles size={15} className="text-[#00A884]" />
        <span className="flex-1 text-[12.5px] font-medium text-wa-text">Improve with AI</span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)} aria-label="Close" className="text-wa-muted">
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={!!busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.id)}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-[13px] text-wa-text disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>
      {busy && (
        <p className="px-3 pb-3 text-[13px] text-wa-muted flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Writing…
        </p>
      )}
      {error && <p className="px-3 pb-3 text-[13px] text-[#F15C6D]">{error}</p>}
      {result && (
        <div className="px-3 pb-3">
          <p className="rounded-lg bg-wa-field px-3 py-2 text-[14.5px] text-wa-text whitespace-pre-wrap break-words">{result}</p>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onUse(result);
              setOpen(false);
              setResult("");
            }}
            className="mt-2 h-9 px-4 rounded-full bg-[#00A884] text-white text-[13.5px] font-medium active:scale-95 transition-transform"
          >
            Use this
          </button>
        </div>
      )}
    </div>
  );
};

export default AiWriteHelp;
