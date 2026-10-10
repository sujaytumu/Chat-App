import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Link2, Image as ImageIcon, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";
import { formatChatListTime } from "../lib/utils";
import { ArrowLeft } from "./icons/WaGlyphs";
import Avatar from "./Avatar";
import SearchSnippet from "./SearchSnippet";

const KINDS = [
  { id: "docs", label: "Documents", icon: FileText },
  { id: "links", label: "Links", icon: Link2 },
  { id: "photos", label: "Photos", icon: ImageIcon },
];

const Heading = ({ children }) => <p className="px-4 pt-5 pb-2 text-[14px] text-wa-muted">{children}</p>;

const hostOf = (text) => {
  const m = text.match(/(?:https?:\/\/|www\.)[^\s]+/i);
  if (!m) return null;
  try {
    return { url: m[0], host: new URL(m[0].startsWith("http") ? m[0] : `https://${m[0]}`).hostname.replace(/^www\./, "") };
  } catch {
    return { url: m[0], host: m[0] };
  }
};

// Matched part bright, the rest dimmed (WhatsApp's "Name is also in this group" line).
const Lit = ({ text, q }) => {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <span className="text-wa-muted">{text}</span>;
  return (
    <>
      <span className="text-wa-muted">{text.slice(0, i)}</span>
      <span className="text-wa-text">{text.slice(i, i + q.length)}</span>
      <span className="text-wa-muted">{text.slice(i + q.length)}</span>
    </>
  );
};

// WhatsApp's full-screen search: pill bar, Documents / Links / Photos chips,
// then Chats, People and Messages (with "From ~ person" chips).
const SearchScreen = ({ onClose }) => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const searchMessages = useChatStore((s) => s.searchMessages);
  const setSelectedChat = useChatStore((s) => s.setSelectedChat);
  const jumpToMessage = useChatStore((s) => s.jumpToMessage);
  const authUser = useAuthStore((s) => s.authUser);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const scrollRef = useRef(null);
  const msgHeadRef = useRef(null);
  useBackToClose(true, onClose);

  const term = q.trim();
  useEffect(() => {
    if (!kind && term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchMessages(term, null, kind || undefined);
        if (mine === seq.current) setResults(r);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, kind, searchMessages]);

  const lc = term.toLowerCase();
  const lockedKeys = authUser?.lockedChats;
  const chats = useMemo(() => {
    if (!lc || kind) return [];
    const mk = (type, c) => ({ type, data: c, name: type === "group" ? c.name : c.fullName, pic: type === "group" ? c.groupPic : c.profilePic, last: c.lastMessage });
    return [...users.filter((u) => u.lastMessage).map((u) => mk("direct", u)), ...groups.map((g) => mk("group", g))].filter((c) => c.name?.toLowerCase().includes(lc) && !(lockedKeys || []).includes(`${c.type === "group" ? "g" : "d"}:${c.data._id}`));
  }, [users, groups, lc, kind, lockedKeys]);
  const people = useMemo(() => (!lc || kind ? [] : users.filter((u) => !u.lastMessage && u.fullName?.toLowerCase().includes(lc))), [users, lc, kind]);

  // Groups that one of the matching people is also in: "Sowmya is also in this group"
  const common = useMemo(() => {
    if (!lc || kind) return [];
    const hit = users.filter((u) => u.fullName?.toLowerCase().includes(lc));
    if (!hit.length) return [];
    return groups
      .map((g) => ({ g, who: hit.find((u) => (g.members || []).some((m) => String(m._id ?? m) === String(u._id))) }))
      .filter((x) => x.who)
      .slice(0, 8);
  }, [groups, users, lc, kind]);

  // "From ~ name" chips: people matching the query
  const senders = useMemo(() => {
    if (!lc || kind) return [];
    const list = users.filter((u) => u.fullName?.toLowerCase().includes(lc)).map((u) => ({ id: u._id, name: u.fullName }));
    if (authUser?.fullName?.toLowerCase().includes(lc)) list.push({ id: authUser._id, name: authUser.fullName });
    return list.slice(0, 4);
  }, [users, lc, kind, authUser]);

  const nameOf = (id) => (id === authUser?._id ? "You" : users.find((u) => u._id === id)?.fullName?.split(" ")[0] || "");
  const shown = from ? results.filter((r) => String(r.senderId) === from) : results;

  const open = (chat) => {
    setSelectedChat({ type: chat.type, data: chat.data });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-x-0 top-0 h-[100dvh] z-[140] bg-wa-bg text-wa-text flex flex-col lg:left-[72px] lg:right-auto lg:w-[400px] xl:w-[420px] lg:border-r lg:border-white/5">
      <div className="px-3 pt-[env(safe-area-inset-top)] pb-2 shrink-0">
        <div className="flex items-center h-12 rounded-full bg-wa-surface pl-2 pr-3">
          <button onClick={onClose} className="size-10 flex items-center justify-center text-wa-text" aria-label="Back">
            <ArrowLeft size={24} />
          </button>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFrom(null);
            }}
            placeholder="Search"
            type="search"
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Keyboard "search" key: hide the keyboard and jump to the message results
              e.currentTarget.blur();
              setTimeout(() => {
                if (msgHeadRef.current && scrollRef.current) scrollRef.current.scrollTo({ top: msgHeadRef.current.offsetTop - 4, behavior: "smooth" });
              }, 120);
            }}
            className="flex-1 min-w-0 bg-transparent px-2 text-[16px] [&::-webkit-search-cancel-button]:hidden text-wa-text placeholder:text-wa-muted focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} className="size-8 flex items-center justify-center text-wa-muted" aria-label="Clear">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-1 pt-1 overflow-x-auto no-scrollbar shrink-0">
        {KINDS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setKind(kind === id ? "" : id)}
            className={`h-10 pl-3 pr-4 rounded-full flex items-center gap-2 text-[14px] shrink-0 ${
              kind === id ? "bg-wa-tint text-wa-tinttext" : "bg-wa-surface text-wa-text2"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-6">
        {chats.length > 0 && (
          <>
            <Heading>Chats</Heading>
            {chats.map((c) => (
              <button key={c.type + c.data._id} onClick={() => open(c)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-wa-surface">
                <Avatar src={c.pic} name={c.name} isGroup={c.type === "group"} size="size-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[16px] text-wa-text truncate">{c.name}</span>
                    {c.last && <span className="text-[12px] text-wa-muted shrink-0">{formatChatListTime(c.last.createdAt)}</span>}
                  </div>
                  {c.last && (
                    <p className="text-[14px] text-wa-muted truncate">
                      {c.last.text || (c.last.image ? "📷 Photo" : c.last.file ? `📎 ${c.last.file.name || "File"}` : "")}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </>
        )}

        {people.length > 0 && (
          <>
            <Heading>People</Heading>
            {people.map((u) => (
              <button key={u._id} onClick={() => open({ type: "direct", data: u })} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-wa-surface">
                <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
                <span className="text-[16px] text-wa-text truncate">{u.fullName}</span>
              </button>
            ))}
          </>
        )}

        {common.length > 0 && (
          <>
            <Heading>Groups in common</Heading>
            {common.map(({ g, who }) => (
              <button key={g._id} onClick={() => open({ type: "group", data: g })} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-wa-surface">
                <Avatar src={g.groupPic} name={g.name} isGroup size="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-wa-text truncate">{g.name}</p>
                  <p className="text-[14px] truncate">
                    <Lit text={`${who.fullName} is also in this group`} q={term} />
                  </p>
                </div>
              </button>
            ))}
          </>
        )}

        {(shown.length > 0 || (kind && !loading) || (term.length >= 2 && !loading && results.length > 0)) && <div ref={msgHeadRef}><Heading>{kind ? KINDS.find((k) => k.id === kind).label : "Messages"}</Heading></div>}

        {senders.length > 0 && results.length > 0 && !kind && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar bg-wa-surface/40">
            {senders.map((s) => (
              <button
                key={s.id}
                onClick={() => setFrom(from === s.id ? null : s.id)}
                className={`h-10 px-4 rounded-full shrink-0 text-[14px] ${from === s.id ? "bg-wa-tint text-wa-tinttext" : "bg-wa-surface text-wa-text2"}`}
              >
                From ~ {s.name}
              </button>
            ))}
          </div>
        )}

        {shown.map((r) => {
          const chat = r.chatType === "group" ? groups.find((g) => g._id === r.chatId) : users.find((u) => u._id === r.chatId);
          if (!chat) return null;
          const name = r.chatType === "group" ? chat.name : chat.fullName;
          const link = (kind === "links" || /https?:\/\/|www\./i.test(r.text || "")) && hostOf(r.text || "");
          const who = nameOf(r.senderId);
          return (
            <button
              key={r._id}
              onClick={() => {
                jumpToMessage({ type: r.chatType, data: chat }, r._id);
                onClose();
              }}
              className="w-full px-4 py-3 text-left active:bg-wa-surface"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[16px] text-wa-text truncate">{name}</span>
                <span className="text-[12px] text-wa-muted shrink-0">{formatChatListTime(r.createdAt)}</span>
              </div>
              {link ? (
                <>
                  {who && <p className="text-[14px] text-wa-muted">{who}:</p>}
                  <div className="mt-1.5 flex items-center gap-3 rounded-xl bg-wa-surface p-3">
                    <span className="size-12 rounded-lg bg-wa-hover text-wa-muted flex items-center justify-center shrink-0">
                      <Link2 size={26} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] text-wa-text truncate">{link.host}</p>
                      <SearchSnippet text={link.url} query={term} className="text-[13px] text-wa-text2 line-clamp-2 break-all" />
                    </div>
                  </div>
                </>
              ) : r.image ? (
                <div className="mt-1.5 flex items-center gap-3">
                  <img src={r.image} alt="" className="size-14 rounded-lg object-cover" loading="lazy" />
                  <span className="text-[14px] text-wa-muted truncate">{who ? `${who}: ` : ""}{r.text || "Photo"}</span>
                </div>
              ) : r.file && (kind === "docs" || !r.text) ? (
                <p className="text-[14px] text-wa-muted truncate flex items-center gap-1.5">
                  <FileText size={16} className="shrink-0" />
                  {who ? `${who}: ` : ""}
                  <SearchSnippet text={r.file.name} query={term} />
                </p>
              ) : (
                <p className="text-[14px] text-wa-muted line-clamp-2">
                  {who ? `${who}: ` : ""}
                  <SearchSnippet text={r.text || ""} query={term} />
                </p>
              )}
            </button>
          );
        })}

        {!loading && (term.length >= 2 || kind) && chats.length === 0 && people.length === 0 && shown.length === 0 && (
          <p className="text-center text-wa-muted py-10 text-[14px]">{term ? `No results for “${term}”` : "Nothing here yet"}</p>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SearchScreen;
