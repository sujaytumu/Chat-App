import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import SearchSnippet from "./SearchSnippet";

const formatWhen = (d) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Search inside the open chat; tapping a result scrolls to that message.
const ChatSearchBar = () => {
  const selectedChat = useChatStore((s) => s.selectedChat);
  const setChatSearchOpen = useChatStore((s) => s.setChatSearchOpen);
  const jumpToMessage = useChatStore((s) => s.jumpToMessage);
  const searchMessages = useChatStore((s) => s.searchMessages);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchMessages(term, selectedChat);
        if (mine === seq.current) setResults(found);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, selectedChat, searchMessages]);

  return (
    <div className="relative shrink-0 bg-[#111B21] border-b border-white/5">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          onClick={() => setChatSearchOpen(false)}
          className="size-10 rounded-full flex items-center justify-center text-[#AEBAC1] hover:bg-white/10"
          aria-label="Close search"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-[#1F2C34] rounded-full px-4 h-10">
          <Search size={17} className="text-[#8696A0] shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in this chat"
            className="flex-1 bg-transparent outline-none text-[15px] text-[#E9EDEF] placeholder:text-[#8696A0]"
          />
        </div>
      </div>

      {results !== null && (
        <div className="absolute left-0 right-0 top-full z-20 max-h-[60dvh] overflow-y-auto bg-[#111B21] border-b border-white/10 shadow-xl">
          {results.length === 0 ? (
            <p className="text-center text-[#8696A0] text-sm py-6">{loading ? "Searching…" : "No messages found"}</p>
          ) : (
            results.map((r) => (
              <button
                key={r._id}
                onClick={() => jumpToMessage(selectedChat, r._id)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5"
              >
                <p className="text-xs text-[#8696A0] mb-0.5">{formatWhen(r.createdAt)}</p>
                <SearchSnippet text={r.text} query={q} className="text-[15px] text-[#E9EDEF]" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ChatSearchBar;
