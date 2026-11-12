import { Check, CalendarClock, Star } from "lucide-react";

// A poll inside a message bubble: tap an option to vote, bars show the share.
const PollCard = ({ message, authUserId, onVote, members }) => {
  const poll = message.poll;
  const total = new Set(poll.options.flatMap((o) => o.votes.map(String))).size;
  const mine = poll.options.filter((o) => o.votes.some((v) => String(v) === String(authUserId))).map((o) => o._id);

  const toggle = (id) => {
    const next = poll.multiple ? (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]) : mine.includes(id) ? [] : [id];
    onVote(next);
  };

  // "When are we free?": slots in date order, the one most people can make is starred and can become an event.
  if (poll.kind === "free") {
    const slots = [...poll.options].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    const top = Math.max(0, ...slots.map((o) => o.votes.length));
    const bestSlot = top > 0 ? slots.find((o) => o.votes.length === top) : null;
    const canPlan = bestSlot?.at && new Date(bestSlot.at).getTime() > Date.now();
    return (
      <div className="w-[260px] max-w-full pb-4">
        <div className="flex items-start gap-3">
          <span className="size-11 shrink-0 rounded-xl bg-[#25D366]/15 text-[#25D366] flex items-center justify-center">
            <CalendarClock size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold leading-snug break-words">{poll.question}</p>
            <p className="text-[11.5px] text-wa-text/60">Tick every slot you can make</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {slots.map((o) => {
            const picked = mine.includes(o._id);
            const isBest = bestSlot && o._id === bestSlot._id;
            return (
              <button
                key={o._id}
                type="button"
                onClick={() => toggle(o._id)}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left border transition-colors ${isBest ? "border-[#25D366]/70 bg-[#25D366]/10" : "border-wa-text/10"}`}
              >
                <span className={`size-5 shrink-0 rounded-md flex items-center justify-center border-2 ${picked ? "bg-[#25D366] border-[#25D366] text-wa-bg" : "border-wa-text/40"}`}>
                  {picked && <Check size={13} strokeWidth={3.5} />}
                </span>
                <span className="flex-1 min-w-0 text-[13px] break-words">{o.text}</span>
                {isBest && <Star size={14} className="shrink-0 text-[#F5C451]" fill="currentColor" />}
                <span className="text-[12px] text-wa-text/75 tabular-nums">
                  {o.votes.length}
                  {members ? `/${members}` : ""}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-wa-text/60">
          {total} replied{members ? ` of ${members}` : ""}
          {bestSlot ? ` · best: ${bestSlot.text}` : ""}
        </p>
        {canPlan && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("talkies:plan-event", { detail: { startsAt: bestSlot.at, title: poll.question === "When are we free?" ? "" : poll.question } }))}
            className="mt-2 w-full h-9 rounded-full bg-[#25D366] text-wa-bg text-[13px] font-medium"
          >
            Plan it for {bestSlot.text}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-[250px] max-w-full pb-4">
      <p className="text-[14px] font-medium leading-snug break-words">{poll.question}</p>
      <p className="text-[11px] text-wa-text/60 mb-2">{poll.multiple ? "Select one or more" : "Select one"}</p>
      <div className="space-y-2.5">
        {poll.options.map((o) => {
          const picked = mine.includes(o._id);
          const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
          return (
            <button key={o._id} type="button" onClick={() => toggle(o._id)} className="w-full text-left">
              <div className="flex items-center gap-2">
                <span
                  className={`size-5 shrink-0 flex items-center justify-center border-2 ${poll.multiple ? "rounded-md" : "rounded-full"} ${
                    picked ? "bg-[#25D366] border-[#25D366] text-wa-bg" : "border-wa-text/40"
                  }`}
                >
                  {picked && <Check size={13} strokeWidth={3.5} />}
                </span>
                <span className="flex-1 min-w-0 text-[13.5px] break-words">{o.text}</span>
                <span className="text-[12px] text-wa-text/70 tabular-nums">{o.votes.length}</span>
              </div>
              <div className="ml-7 mt-1 h-1 rounded-full bg-wa-text/15 overflow-hidden">
                <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-wa-text/60">{total} vote{total === 1 ? "" : "s"}</p>
    </div>
  );
};

export default PollCard;
