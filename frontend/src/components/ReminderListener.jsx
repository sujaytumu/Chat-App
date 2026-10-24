import { useEffect } from "react";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

// A reminder you set has come due: show it (push covers the app being closed).
const ReminderListener = () => {
  const socket = useAuthStore((s) => s.socket);
  useEffect(() => {
    if (!socket) return;
    const onDue = (r) => {
      toast(
        (t) => (
          <button
            className="flex items-start gap-2 text-left"
            onClick={() => {
              toast.dismiss(t.id);
              const st = useChatStore.getState();
              const chat = r.chatType === "group" ? (st.groups || []).find((g) => String(g._id) === String(r.chatId)) : (st.users || []).find((u) => String(u._id) === String(r.chatId));
              if (chat) st.setSelectedChat({ type: r.chatType, data: chat });
            }}
          >
            <Bell size={18} className="mt-0.5 shrink-0" />
            <span>
              <span className="block font-semibold text-[13px]">Reminder</span>
              <span className="block text-[13px] line-clamp-3">{r.preview || "A message you wanted to revisit"}</span>
            </span>
          </button>
        ),
        { duration: 15000 }
      );
    };
    socket.on("reminderDue", onDue);
    return () => socket.off("reminderDue", onDue);
  }, [socket]);
  return null;
};

export default ReminderListener;
