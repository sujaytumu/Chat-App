import { X, Check, CheckCheck } from "lucide-react";
import Avatar from "./Avatar";
import { receiptsFor } from "./MessageTicks";

const formatTime = (dateStr) =>
  dateStr
    ? new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const Shell = ({ onClose, children }) => (
  <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-[#1F2C34] rounded-2xl w-full max-w-sm max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
        <h3 className="font-semibold text-white">Message info</h3>
        <button onClick={onClose} className="text-[#8696A0] hover:text-white" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Section = ({ icon, title, count, people }) =>
  people.length === 0 ? null : (
    <div className="py-2">
      <div className="flex items-center gap-2 px-4 py-2 text-[13px] text-[#8696A0]">
        {icon}
        <span>
          {title} <span className="opacity-70">({count})</span>
        </span>
      </div>
      {people.map(({ member, at }) => (
        <div key={member._id} className="flex items-center gap-3 px-4 py-2">
          <Avatar src={member.profilePic} name={member.fullName} size="size-10" textSize="text-base" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-[#E9EDEF] truncate">{member.fullName}</p>
          </div>
          {at && <span className="text-xs text-[#8696A0] shrink-0">{formatTime(at)}</span>}
        </div>
      ))}
    </div>
  );

// Group: who has read it, who it was delivered to, who it hasn't reached yet.
const GroupInfo = ({ message, members, onClose }) => {
  const { others, seen, delivered } = receiptsFor(message, members, message.senderId);
  const timeOf = (log, id) => (log || []).find((e) => String(e.user) === String(id))?.at || null;

  const readBy = seen
    .map((member) => ({ member, at: timeOf(message.seenLog, member._id) }))
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  const seenIds = new Set(seen.map((m) => m._id));
  const deliveredOnly = delivered
    .filter((m) => !seenIds.has(m._id))
    .map((member) => ({ member, at: timeOf(message.deliveredTo, member._id) }));
  const deliveredIds = new Set(delivered.map((m) => m._id));
  const remaining = others.filter((m) => !deliveredIds.has(m._id)).map((member) => ({ member, at: null }));

  return (
    <Shell onClose={onClose}>
      <div className="px-4 py-3 border-b border-white/10 text-sm text-[#D1D7DB] flex items-center gap-2">
        <Check size={16} className="text-[#8696A0]" /> Sent {formatTime(message.createdAt)}
      </div>
      <Section
        icon={<CheckCheck size={16} className="text-[#53BDEB]" />}
        title="Read by"
        count={`${readBy.length} of ${others.length}`}
        people={readBy}
      />
      <Section
        icon={<CheckCheck size={16} className="text-[#8696A0]" />}
        title="Delivered to"
        count={`${deliveredOnly.length}`}
        people={deliveredOnly}
      />
      <Section
        icon={<Check size={16} className="text-[#8696A0]" />}
        title="Remaining"
        count={`${remaining.length}`}
        people={remaining}
      />
      {others.length === 0 && <p className="p-4 text-xs text-[#8696A0]">No other members in this group.</p>}
    </Shell>
  );
};

const MessageInfoModal = ({ message, onClose, members }) => {
  if (members) return <GroupInfo message={message} members={members} onClose={onClose} />;

  const readAt = formatTime(message.seenAt);
  const deliveredAt = formatTime(message.deliveredAt);
  const sentAt = formatTime(message.createdAt);

  return (
    <Shell onClose={onClose}>
      <div className="p-4 space-y-4">
        {readAt && (
          <div className="flex items-center gap-3">
            <CheckCheck size={18} className="text-[#53BDEB]" />
            <div>
              <p className="text-sm text-[#D1D7DB]">Read</p>
              <p className="text-xs text-[#8696A0]">{readAt}</p>
            </div>
          </div>
        )}
        {deliveredAt && (
          <div className="flex items-center gap-3">
            <CheckCheck size={18} className="text-[#8696A0]" />
            <div>
              <p className="text-sm text-[#D1D7DB]">Delivered</p>
              <p className="text-xs text-[#8696A0]">{deliveredAt}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Check size={18} className="text-[#8696A0]" />
          <div>
            <p className="text-sm text-[#D1D7DB]">Sent</p>
            <p className="text-xs text-[#8696A0]">{sentAt}</p>
          </div>
        </div>
        {!readAt && !deliveredAt && <p className="text-xs text-[#8696A0]">Not yet delivered</p>}
      </div>
    </Shell>
  );
};

export default MessageInfoModal;
