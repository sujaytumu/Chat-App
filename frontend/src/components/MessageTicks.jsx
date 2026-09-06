import { Check, CheckCheck } from "lucide-react";

// WhatsApp-style receipt ticks for direct messages:
// single gray = sent, double gray = delivered, double blue = seen
const MessageTicks = ({ message }) => {
  if (message.seen) return <CheckCheck size={15} className="text-[#53BDEB]" />;
  if (message.delivered) return <CheckCheck size={15} className="opacity-80" />;
  return <Check size={15} className="opacity-80" />;
};

export default MessageTicks;
