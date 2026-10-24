import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import { fmtWhen } from "./ScheduleSheet";

// The messages you scheduled in this chat (cancel any of them).
const ScheduledPanel = ({ chat, onClose }) => {
  useBackToClose(true, onClose);
  const [list, setList] = useState(null);
  useEffect(() => {
    axiosInstance
      .get("/scheduled", { params: { chatType: chat.type, chatId: chat.data._id } })
      .then((r) => setList(r.data))
      .catch(() => setList([]));
  }, [chat.type, chat.data._id]);

  const cancel = async (id) => {
    try {
      await axiosInstance.delete(`/scheduled/${id}`);
      setList((l) => l.filter((x) => x._id !== id));
      toast("Scheduled message cancelled");
    } catch {
      toast.error("Couldn't cancel it");
    }
  };

  return (
    <div className="fixed inset-0 z-[96] bg-wa-bg text-wa-text flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[16px]">Scheduled messages</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!list ? (
          <p className="text-center text-wa-muted py-16">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-center text-wa-muted py-16 px-8 text-[13.5px]">
            Nothing scheduled in this chat.
            <br />
            Type a message, then press and hold the send button to pick a time.
          </p>
        ) : (
          list.map((m) => (
            <div key={m._id} className="flex items-start gap-3 px-5 py-3 border-b border-white/10">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[#00A884] font-medium">{fmtWhen(m.sendAt)}</p>
                <p className="text-[13.5px] break-words whitespace-pre-wrap mt-0.5">{m.text}</p>
              </div>
              <button onClick={() => cancel(m._id)} className="size-10 rounded-full flex items-center justify-center text-[#F15C6D] hover:bg-white/5" aria-label="Cancel scheduled message">
                <Trash2 size={20} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ScheduledPanel;
