import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState } from "react";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import ImageLightbox from "./ImageLightbox";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const { messages, isMessagesLoading, selectedChat, typingUsers } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const isGroup = selectedChat.type === "group";
  const data = selectedChat.data;

  const membersById = isGroup
    ? Object.fromEntries(data.members.map((m) => [m._id, m]))
    : {};

  const isOtherTyping = isGroup
    ? (typingUsers[`group:${data._id}`]?.size ?? 0) > 0
    : (typingUsers[data._id]?.size ?? 0) > 0;

  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOtherTyping]);

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto bg-[#ECE5DD]">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-[#ECE5DD]">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => {
          const isMe = message.senderId === authUser._id;
          const sender = isGroup ? membersById[message.senderId] : isMe ? authUser : data;

          return (
            <div key={message._id} className={`flex items-end ${isMe ? "justify-end" : "justify-start"}`}>
              {!isMe && (
                <div className="w-8 h-8 rounded-full overflow-hidden mr-2 shrink-0">
                  <img
                    src={sender?.profilePic || "/avatar.png"}
                    alt="profile pic"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div
                className={`max-w-[65%] sm:max-w-[45%] px-3 py-1.5 rounded-lg break-words shadow-sm flex flex-col ${
                  isMe ? "bg-[#25D366] text-white rounded-br-none" : "bg-white text-black rounded-bl-none"
                }`}
              >
                {isGroup && !isMe && (
                  <span className="text-xs font-semibold text-primary mb-0.5">
                    {sender?.fullName || "Unknown"}
                  </span>
                )}
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    onClick={() => setLightboxSrc(message.image)}
                    className="max-w-[220px] rounded-md mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                  />
                )}
                {message.text && <span style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>}
                <span
                  className={`self-end mt-0.5 text-[10px] leading-none flex items-center gap-1 whitespace-nowrap ${
                    isMe ? "text-white/80" : "text-black/60"
                  }`}
                >
                  {formatMessageTime(message.createdAt)}
                  {isMe && !isGroup && message.seen && <span>✓✓</span>}
                  {isMe && isGroup && message.seenBy?.length > 1 && <span>✓✓</span>}
                </span>
              </div>
              {isMe && (
                <div className="w-8 h-8 rounded-full overflow-hidden ml-2 shrink-0">
                  <img
                    src={authUser.profilePic || "/avatar.png"}
                    alt="profile pic"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          );
        })}

        {isOtherTyping && (
          <div className="flex items-center gap-1 px-2">
            <span className="size-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="size-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="size-2 rounded-full bg-zinc-400 animate-bounce" />
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      <MessageInput />

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
};

export default ChatContainer;
