import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";

// "Summarize chat": a short AI recap of the latest messages. Nothing is sent until you pick a size.
const ChatSummarySheet = ({ chat, onClose }) => {
  useBackToClose(true, onClose);
  const [state, setState] = useState({ phase: "pick" }); // pick | loading | done | error
  const name = chat.type === "group" ? chat.data.name : chat.data.fullName;

  const run = async (count) => {
    setState({ phase: "loading" });
    try {
      const res = await axiosInstance.post("/messages/summary", { chatType: chat.type, chatId: chat.data._id, count });
      if (res.data.tooShort) setState({ phase: "error", msg: "There aren't enough messages to summarize yet." });
      else setState({ phase: "done", text: res.data.summary, count: res.data.count });
    } catch (e) {
      const err = e.response?.data?.error;
      setState({ phase: "error", msg: err === "not_configured" ? "AI summaries aren't turned on for this server yet. The server owner needs to add a GROQ_API_KEY or OPENAI_API_KEY." : err || "Couldn't write the summary" });
    }
  };

  const lines = (state.text || "").split("\n").map((l) => l.trim()).filter(Boolean);

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[17px] font-semibold flex items-center gap-2"><Sparkles size={19} className="text-[#21C063]" /> Catch me up</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted"><X size={22} /></button>
        </div>
        <p className="text-[13px] text-wa-muted mb-3">{name}</p>

        {state.phase === "pick" && (
          <>
            <p className="text-[13px] text-wa-text/80 mb-3">Writes a short recap of the latest messages. The text of those messages is sent to an AI service to write it, only when you tap below.</p>
            <div className="grid grid-cols-3 gap-2">
              {[50, 100, 200].map((n) => (
                <button key={n} onClick={() => run(n)} className="h-11 rounded-full bg-wa-field text-[13.5px] font-medium active:scale-95 transition-transform">Last {n}</button>
              ))}
            </div>
          </>
        )}
        {state.phase === "loading" && (
          <div className="py-8 flex flex-col items-center gap-3 text-wa-muted text-[13px]"><Loader2 className="animate-spin" /> Reading the chat…</div>
        )}
        {state.phase === "done" && (
          <>
            <div className="space-y-2 text-[14px] leading-relaxed">
              {lines.map((l, i) => (l.startsWith("-") || l.startsWith("•") ? <p key={i} className="pl-3 -indent-3">• {l.replace(/^[-•]\s*/, "")}</p> : <p key={i} className="font-medium">{l}</p>))}
            </div>
            <p className="mt-4 text-[11.5px] text-wa-muted">Based on the last {state.count} messages. AI can make mistakes.</p>
          </>
        )}
        {state.phase === "error" && <p className="text-[13.5px] text-[#F15C6D] py-2">{state.msg}</p>}
      </div>
    </div>,
    document.body
  );
};

export default ChatSummarySheet;
