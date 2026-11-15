import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Send, Sparkles, Trash2, Loader2, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";

const STARTERS = ["Write a polite message declining an invite", "Translate “see you tomorrow” to Hindi", "Give me 3 fun things to say to a friend on their birthday", "Explain UPI in simple words"];
const MAX_KEPT = 60;

const loadHistory = (key) => {
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(list) ? list.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
};

// Talkies AI: a private assistant chat. The conversation is kept on this device only.
const AIChatPage = () => {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.authUser);
  const key = `talkies_ai_chat_${authUser?._id || "me"}`;
  const [messages, setMessages] = useState(() => loadHistory(key));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_KEPT)));
    } catch {
      /* storage blocked: the chat still works, it just won't be remembered */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, key]);

  const send = async (raw) => {
    const content = String(raw ?? text).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/ai/chat", { messages: next.slice(-20) });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const why = e?.response?.data?.error || "Talkies AI couldn't answer. Check your connection and try again.";
      setMessages((m) => [...m, { role: "assistant", content: why, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    if (!messages.length || !window.confirm("Clear this conversation?")) return;
    setMessages([]);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-wa-bg text-wa-text">
      <header className="shrink-0 flex items-center gap-2 px-2 h-14 bg-wa-panel border-b border-white/5 pt-[env(safe-area-inset-top)] box-content">
        <button onClick={() => navigate(-1)} aria-label="Back" className="size-10 flex items-center justify-center rounded-full active:bg-white/10">
          <ChevronLeft size={24} />
        </button>
        <div className="size-9 rounded-full bg-gradient-to-br from-[#00A884] to-[#7C5CFF] flex items-center justify-center">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15.5px] font-medium leading-tight">Talkies AI</p>
          <p className="text-[11.5px] text-wa-muted leading-tight">{busy ? "typing…" : "Ask me anything"}</p>
        </div>
        <button onClick={clear} aria-label="Clear conversation" className="size-10 flex items-center justify-center rounded-full text-wa-muted active:bg-white/10">
          <Trash2 size={19} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="max-w-sm mx-auto text-center pt-8">
            <div className="mx-auto size-16 rounded-full bg-gradient-to-br from-[#00A884] to-[#7C5CFF] flex items-center justify-center mb-3">
              <Sparkles size={30} className="text-white" />
            </div>
            <p className="text-[17px] font-medium">Hi{authUser?.fullName ? `, ${authUser.fullName.split(" ")[0]}` : ""}! I&apos;m Talkies AI</p>
            <p className="text-[13px] text-wa-muted mt-1">Ask questions, get message ideas, or have something translated. This chat stays on your device.</p>
            <div className="mt-5 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-2xl bg-wa-field px-4 py-2.5 text-left text-[13.5px] active:scale-[0.98] transition-transform">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap break-words ${
                m.role === "user" ? "bg-[#005C4B] text-white rounded-br-md" : m.error ? "bg-[#F15C6D]/15 text-[#F15C6D] rounded-bl-md" : "bg-wa-panel text-wa-text rounded-bl-md"
              }`}
            >
              {m.content}
              {m.role === "assistant" && !m.error && (
                <button
                  onClick={() => navigator.clipboard?.writeText(m.content).then(() => toast.success("Copied"), () => {})}
                  aria-label="Copy"
                  className="mt-1 flex items-center gap-1 text-[11px] text-wa-muted"
                >
                  <Copy size={12} /> Copy
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-wa-panel px-4 py-3 flex gap-1" aria-label="Talkies AI is typing">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-2 rounded-full bg-wa-muted animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="shrink-0 flex items-end gap-2 px-3 py-2 bg-wa-panel pb-[calc(8px+env(safe-area-inset-bottom))]"
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia?.("(hover: hover)").matches) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask Talkies AI"
          className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl bg-wa-field px-4 py-2.5 text-[15px] outline-none"
        />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="size-11 shrink-0 rounded-full bg-[#00A884] text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </form>
    </div>
  );
};

export default AIChatPage;
