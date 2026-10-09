import { useEffect, useState } from "react";
import { ArrowLeft, Star } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const fmt = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Starred messages of one chat; tapping one jumps to it in the conversation.
export function useStarredCount(chatType, chatId) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    axiosInstance
      .get("/messages/starred/all", { params: { chatType, chatId } })
      .then((r) => alive && setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [chatType, chatId]);
  return list;
}

const ChatStarredPanel = ({ list, chat, title, onClose, onJump }) => {
  const { authUser } = useAuthStore();
  const jumpToMessage = useChatStore((s) => s.jumpToMessage);
  useBackToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-[96] bg-wa-bg text-wa-text flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[19px] truncate">Starred in {title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!list ? (
          <p className="text-center text-wa-muted py-16">Loading…</p>
        ) : list.length === 0 ? (
          <div className="text-center text-wa-muted py-16 px-8">
            <Star size={36} className="mx-auto mb-3" />
            No starred messages in this chat yet.
          </div>
        ) : (
          list.map((m) => {
            const mine = (m.senderId?._id || m.senderId) === authUser._id;
            const body = m.text || (m.image ? "📷 Photo" : m.file ? `📎 ${m.file.name || "File"}` : "Message");
            return (
              <button
                key={m._id}
                onClick={() => {
                  onJump?.();
                  setTimeout(() => jumpToMessage(chat, m._id), 120);
                }}
                className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5"
              >
                <span className="flex justify-between text-[13px] text-wa-muted mb-1">
                  <span>{mine ? "You" : m.senderId?.fullName || "Member"}</span>
                  <span>{fmt(m.createdAt)}</span>
                </span>
                <span className="block text-[15px] line-clamp-3 break-words">{body}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatStarredPanel;
