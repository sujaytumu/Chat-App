import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// "Create poll": question, 2–12 options, optionally allow several answers.
const PollModal = ({ onClose, onSend }) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [sending, setSending] = useState(false);
  useBackToClose(true, onClose);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ok = question.trim() && new Set(filled.map((o) => o.toLowerCase())).size >= 2;

  const submit = async () => {
    if (!ok || sending) return;
    setSending(true);
    try {
      await onSend({ question: question.trim(), options: filled.map((text) => ({ text })), multiple });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-wa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-icon" aria-label="Close">
            <X size={22} />
          </button>
          <h3 className="flex-1 text-[17px] text-wa-text">Create poll</h3>
          <button
            onClick={submit}
            disabled={!ok || sending}
            className="h-9 px-5 rounded-full bg-[#25D366] text-wa-bg text-[14px] font-medium disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-5">
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">Question</p>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
              placeholder="Ask question"
              className="w-full rounded-xl bg-wa-field px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted outline-none"
            />
          </div>
          <div>
            <p className="text-[13px] text-wa-muted mb-1.5">Options</p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                    maxLength={100}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 min-w-0 rounded-xl bg-wa-field px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted outline-none"
                  />
                  {options.length > 2 && (
                    <button onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))} className="size-9 flex items-center justify-center text-wa-muted" aria-label="Remove option">
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 12 && (
              <button onClick={() => setOptions((cur) => [...cur, ""])} className="mt-3 flex items-center gap-2 text-[14px] text-[#25D366]">
                <Plus size={18} /> Add option
              </button>
            )}
          </div>
          <button onClick={() => setMultiple((v) => !v)} className="w-full flex items-center justify-between text-[15px] text-wa-text" role="switch" aria-checked={multiple}>
            Allow multiple answers
            <span className={`w-11 h-6 rounded-full relative transition-colors ${multiple ? "bg-[#25D366]" : "bg-wa-field"}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${multiple ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PollModal;
