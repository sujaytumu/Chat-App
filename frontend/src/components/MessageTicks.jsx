import { Check, CheckCheck } from "lucide-react";

// WhatsApp-style receipt ticks for direct messages:
// single gray = sent, double gray = delivered, double blue = seen
const MessageTicks = ({ message }) => {
  if (message.seen) return <CheckCheck size={15} className="text-[#53BDEB]" />;
  if (message.delivered) return <CheckCheck size={15} className="opacity-80" />;
  return <Check size={15} className="opacity-80" />;
};

// Group version: double blue only once EVERY member has read it, double grey
// once every member's device has it, single tick until then — exactly like
// WhatsApp. Open "Message info" to see who, member by member.
export const receiptsFor = (message, members = [], senderId) => {
  const others = members.filter((m) => m._id !== senderId);
  const seenIds = new Set([...(message.seenBy || []), ...(message.seenLog || []).map((s) => s.user)].map(String));
  const deliveredIds = new Set([...seenIds, ...(message.deliveredTo || []).map((d) => String(d.user))]);
  return {
    others,
    seen: others.filter((m) => seenIds.has(String(m._id))),
    delivered: others.filter((m) => deliveredIds.has(String(m._id))),
  };
};

export const GroupMessageTicks = ({ message, members, senderId }) => {
  const { others, seen, delivered } = receiptsFor(message, members, senderId);
  if (others.length > 0 && seen.length === others.length) return <CheckCheck size={15} className="text-[#53BDEB]" />;
  if (others.length > 0 && delivered.length === others.length) return <CheckCheck size={15} className="opacity-80" />;
  return <Check size={15} className="opacity-80" />;
};

export default MessageTicks;
