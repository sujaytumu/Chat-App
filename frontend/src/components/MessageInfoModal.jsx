import { X, Check, CheckCheck } from "lucide-react";

const formatTime = (dateStr) =>
  dateStr
    ? new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const MessageInfoModal = ({ message, onClose }) => {
  const readAt = formatTime(message.seenAt);
  const deliveredAt = formatTime(message.deliveredAt);
  const sentAt = formatTime(message.createdAt);

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1F2C34] rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-white">Message info</h3>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white">
            <X size={20} />
          </button>
        </div>
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
          {!readAt && !deliveredAt && (
            <p className="text-xs text-[#8696A0]">Not yet delivered</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageInfoModal;
