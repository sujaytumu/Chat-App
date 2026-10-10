import { Check } from "lucide-react";

// A poll inside a message bubble: tap an option to vote, bars show the share.
const PollCard = ({ message, authUserId, onVote }) => {
  const poll = message.poll;
  const total = new Set(poll.options.flatMap((o) => o.votes.map(String))).size;
  const mine = poll.options.filter((o) => o.votes.some((v) => String(v) === String(authUserId))).map((o) => o._id);

  const toggle = (id) => {
    const next = poll.multiple ? (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]) : mine.includes(id) ? [] : [id];
    onVote(next);
  };

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
