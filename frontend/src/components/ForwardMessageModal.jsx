import { useState } from "react";
import { X, Send } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const ForwardMessageModal = ({ message, onClose }) => {
  const { users, groups, forwardMessage } = useChatStore();
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  const items = [
    ...users.map((u) => ({ type: "direct", data: u, key: `d-${u._id}`, name: u.fullName, avatar: u.profilePic })),
    ...groups.map((g) => ({ type: "group", data: g, key: `g-${g._id}`, name: g.name, avatar: g.groupPic })),
  ];

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    await forwardMessage(message, selected);
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1F2C34] rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-white">Forward to</h3>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => setSelected({ type: item.type, data: item.data })}
              className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 ${
                selected?.data._id === item.data._id ? "bg-white/10" : ""
              }`}
            >
              <img src={item.avatar || "/avatar.png"} alt={item.name} className="size-10 rounded-full object-cover" />
              <span className="text-[#D1D7DB] truncate">{item.name}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleSend}
            disabled={!selected || sending}
            className="btn w-full bg-[#00A884] hover:bg-[#02906f] text-white border-none gap-2"
          >
            <Send size={16} /> {sending ? "Sending…" : "Forward"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardMessageModal;
