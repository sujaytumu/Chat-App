import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "./Avatar";

// Full-screen "Add members" picker (WhatsApp style): search bar on top, "Invite via link or QR code",
// "Frequently contacted" (people you chat with most recently) then everyone else A-Z, a round tick on the
// right of each row, chosen people as chips under the search bar and a green arrow button to confirm.
// `people` arrive already ordered by recent chat activity.
const AddMembersPicker = ({ people, onClose, onAdd, onInvite }) => {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useBackToClose(true, onClose);

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const byId = useMemo(() => new Map(people.map((p) => [p._id, p])), [people]);

  const { frequent, others, results } = useMemo(() => {
    if (q) {
      const hit = people.filter(
        (p) => (p.fullName || "").toLowerCase().includes(q) || (p.username || "").toLowerCase().includes(q),
      );
      return { frequent: [], others: [], results: hit };
    }
    const recent = people.filter((p) => p.lastMessage).slice(0, 8);
    const recentIds = new Set(recent.map((p) => p._id));
    const rest = people
      .filter((p) => !recentIds.has(p._id))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
    return { frequent: recent, others: rest, results: [] };
  }, [people, q]);

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await onAdd(picked);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ p }) => {
    const on = picked.includes(p._id);
    return (
      <button
        type="button"
        onClick={() => toggle(p._id)}
        className="w-full flex items-center gap-5 px-5 py-2 text-left active:bg-white/5"
      >
        <Avatar src={p.profilePic} name={p.fullName} size="size-[60px]" textSize="text-2xl" />
        <span className="flex-1 min-w-0 border-b border-white/10 py-[22px] -my-2 flex items-center">
          <span className="flex-1 min-w-0 truncate text-[21px]">{p.fullName}</span>
          <span
            className={`size-[36px] rounded-full flex items-center justify-center shrink-0 border-2 ${
              on ? "bg-[#21C063] border-[#21C063] text-[#0B141A]" : "border-wa-muted/70"
            }`}
          >
            {on && <Check size={21} strokeWidth={3} />}
          </span>
        </span>
      </button>
    );
  };

  const Section = ({ title, list }) =>
    list.length ? (
      <>
        <p className="px-5 pt-5 pb-3 text-[18px] text-wa-muted">{title}</p>
        {list.map((p) => (
          <Row key={p._id} p={p} />
        ))}
      </>
    ) : null;

  return (
    <div className="fixed inset-0 z-[100] bg-wa-bg text-wa-text flex flex-col">
      {/* search bar */}
      <div className="px-3 pt-3 pb-2 shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}>
        <div className="flex items-center gap-2 h-[62px] rounded-full bg-wa-panel px-3.5">
          <button type="button" onClick={onClose} aria-label="Back" className="size-10 rounded-full flex items-center justify-center">
            <ArrowLeft size={26} />
          </button>
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or @username…"
            className="flex-1 min-w-0 bg-transparent outline-none text-[19px] placeholder:text-wa-muted"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="size-9 rounded-full flex items-center justify-center">
              <X size={18} className="text-wa-muted" />
            </button>
          )}
        </div>
      </div>

      {/* chosen people */}
      {picked.length > 0 && (
        <div className="shrink-0 flex gap-4 overflow-x-auto px-5 pb-3 pt-1 no-scrollbar">
          {picked.map((id) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <button key={id} type="button" onClick={() => toggle(id)} className="relative flex flex-col items-center w-[68px] shrink-0">
                <span className="relative">
                  <Avatar src={p.profilePic} name={p.fullName} size="size-[60px]" textSize="text-2xl" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-wa-panel border border-wa-bg flex items-center justify-center">
                    <X size={12} />
                  </span>
                </span>
                <span className="mt-1 text-xs truncate w-full text-center">{(p.fullName || "").split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-32">
        {!q && onInvite && (
          <button type="button" onClick={onInvite} className="w-full flex items-center gap-5 px-5 py-3.5 text-left active:bg-white/5">
            <span className="size-[60px] rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center shrink-0">
              <Link2 size={28} />
            </span>
            <span className="text-[21px]">Invite via link or QR code</span>
          </button>
        )}

        {people.length === 0 && <p className="px-4 py-8 text-center text-sm text-wa-muted">Everyone is already in this group</p>}
        {q && results.length === 0 && people.length > 0 && (
          <p className="px-4 py-8 text-center text-sm text-wa-muted">No one found for "{query.trim()}"</p>
        )}
        <Section title="Results" list={results} />
        <Section title="Frequently contacted" list={frequent} />
        <Section title={frequent.length ? "More people" : "People"} list={others} />
      </div>

      {/* confirm */}
      {picked.length > 0 && (
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          aria-label={`Add ${picked.length} to group`}
          className="absolute right-6 size-[68px] rounded-[22px] bg-[#21C063] text-[#0B141A] shadow-lg flex items-center justify-center"
          style={{ bottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}
        >
          {busy ? <Loader2 size={26} className="animate-spin" /> : <ArrowRight size={32} />}
        </button>
      )}
    </div>
  );
};

export default AddMembersPicker;
