import { CalendarDays, MapPin } from "lucide-react";

const when = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

// An event inside a message bubble: what / when / where, and Going · Maybe · Can't go.
const EventCard = ({ message, authUserId, onRsvp }) => {
  const ev = message.event;
  const has = (list) => (list || []).some((u) => String(u) === String(authUserId));
  const mine = has(ev.going) ? "going" : has(ev.maybe) ? "maybe" : has(ev.declined) ? "no" : "";
  const past = new Date(ev.startsAt).getTime() < Date.now();
  const btn = (answer, label, count) => (
    <button
      key={answer}
      type="button"
      onClick={() => onRsvp(answer)}
      className={`flex-1 h-9 rounded-full text-[12.5px] font-medium border transition-colors ${mine === answer ? "bg-[#25D366] border-[#25D366] text-wa-bg" : "border-wa-text/25 text-wa-text/90"}`}
    >
      {label}
      {count > 0 ? ` · ${count}` : ""}
    </button>
  );
  return (
    <div className="w-[260px] max-w-full pb-4">
      <div className="flex items-start gap-3">
        <span className="size-11 shrink-0 rounded-xl bg-[#25D366]/15 text-[#25D366] flex items-center justify-center">
          <CalendarDays size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold leading-snug break-words">{ev.title}</p>
          <p className="text-[12px] text-wa-text/70">{when(ev.startsAt)}{past ? " · ended" : ""}</p>
        </div>
      </div>
      {ev.location && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-wa-text/80">
          <MapPin size={14} className="shrink-0 text-[#F15C6D]" />
          <span className="break-words">{ev.location}</span>
        </p>
      )}
      {ev.description && <p className="mt-2 text-[13px] leading-snug break-words whitespace-pre-wrap text-wa-text/90">{ev.description}</p>}
      <div className="mt-3 flex gap-2">
        {btn("going", "Going", ev.going?.length || 0)}
        {btn("maybe", "Maybe", ev.maybe?.length || 0)}
        {btn("no", "Can't go", ev.declined?.length || 0)}
      </div>
    </div>
  );
};

export default EventCard;
