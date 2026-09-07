import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState, useMemo } from "react";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import ImageLightbox from "./ImageLightbox";
import MessageTicks from "./MessageTicks";
import AttachmentContent from "./AttachmentContent";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";
import { Pin, PinOff, X } from "lucide-react";

const ChatContainer = () => {
  const { messages, isMessagesLoading, selectedChat, typingUsers, togglePinMessage } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const messageRefs = useRef({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const prevChatKeyRef = useRef(null);

  const isGroup = selectedChat.type === "group";
  const data = selectedChat.data;

  const membersById = isGroup
    ? Object.fromEntries(data.members.map((m) => [m._id, m]))
    : {};

  const isOtherTyping = isGroup
    ? (typingUsers[`group:${data._id}`]?.size ?? 0) > 0
    : (typingUsers[data._id]?.size ?? 0) > 0;

  const pinnedMessage = useMemo(() => {
    const pinned = messages.filter((m) => m.pinned);
    return pinned.length > 0 ? pinned[pinned.length - 1] : null;
  }, [messages]);

  useEffect(() => {
    if (!messageEndRef.current) return;

    // Jump straight to the bottom instantly when a chat is first opened —
    // animating a smooth scroll through the whole history looks like a
    // random mid-chat jump/lag. Only new messages arriving in an already-
    // open chat get the smooth scroll.
    const chatKey = `${selectedChat.type}:${data._id}`;
    const isFreshOpen = prevChatKeyRef.current !== chatKey;
    prevChatKeyRef.current = chatKey;

    messageEndRef.current.scrollIntoView({ behavior: isFreshOpen ? "auto" : "smooth" });
  }, [messages, isOtherTyping, selectedChat, data._id]);

  const scrollToPinned = () => {
    if (pinnedMessage) {
      messageRefs.current[pinnedMessage._id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto bg-[#0B141A]">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-[#0B141A]">
      <ChatHeader />

      {pinnedMessage && (
        <button
          onClick={scrollToPinned}
          className="flex items-center gap-2 px-4 py-2 bg-[#202C33] border-b border-black/30 text-left hover:bg-[#26333c] transition-colors"
        >
          <Pin size={14} className="text-[#00A884] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#00A884]">Pinned message</p>
            <p className="text-sm truncate text-[#D1D7DB]">
              {pinnedMessage.image ? "📷 Photo" : pinnedMessage.file ? `📎 ${pinnedMessage.file.name}` : pinnedMessage.text}
            </p>
          </div>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePinMessage(pinnedMessage._id);
            }}
            className="size-6 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10 shrink-0"
            title="Unpin"
          >
            <X size={13} />
          </span>
        </button>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => {
          const isMe = message.senderId === authUser._id;
          const sender = isGroup ? membersById[message.senderId] : isMe ? authUser : data;

          return (
            <div
              key={message._id}
              ref={(el) => (messageRefs.current[message._id] = el)}
              className={`flex items-end gap-0 group ${isMe ? "justify-end" : "justify-start"}`}
              onMouseEnter={() => setHoveredId(message._id)}
              onMouseLeave={() => setHoveredId((id) => (id === message._id ? null : id))}
            >
              {!isMe && (
                <div className="w-8 h-8 rounded-full overflow-hidden mr-2 shrink-0">
                  <img
                    src={sender?.profilePic || "/avatar.png"}
                    alt="profile pic"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {isMe && (
                <button
                  onClick={() => togglePinMessage(message._id)}
                  className={`size-6 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10 mr-1 mb-1 transition-opacity ${
                    hoveredId === message._id ? "opacity-100" : "opacity-0"
                  }`}
                  title={message.pinned ? "Unpin" : "Pin"}
                >
                  {message.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              )}

              <div
                className={`max-w-[70%] sm:max-w-[55%] px-2.5 py-1.5 rounded-lg break-words shadow-sm flex flex-col ${
                  isMe ? "bg-[#005C4B] text-[#E9EDEF] rounded-br-none" : "bg-[#202C33] text-[#E9EDEF] rounded-bl-none"
                }`}
              >
                {isGroup && !isMe && (
                  <span className="text-xs font-semibold text-[#00A884] mb-0.5">
                    {sender?.fullName || "Unknown"}
                  </span>
                )}
                {message.pinned && (
                  <span className="flex items-center gap-1 text-[10px] mb-0.5 text-[#8696A0]">
                    <Pin size={10} /> Pinned
                  </span>
                )}
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    loading="lazy"
                    onClick={() => setLightboxSrc(message.image)}
                    className="max-w-[260px] max-h-[320px] w-auto h-auto object-cover rounded-md mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                  />
                )}
                {message.file && <AttachmentContent file={message.file} />}
                {message.text && (
                  <span className="text-[14.2px] leading-[19px]" style={{ whiteSpace: "pre-wrap" }}>
                    {message.text}
                  </span>
                )}
                <span
                  className="self-end mt-0.5 text-[10px] leading-none flex items-center gap-1 whitespace-nowrap text-[#8696A0]"
                >
                  {formatMessageTime(message.createdAt)}
                  {isMe && !isGroup && <MessageTicks message={message} />}
                  {isMe && isGroup && message.seenBy?.length > 1 && <span className="text-[#53BDEB]">✓✓</span>}
                </span>
              </div>

              {!isMe && (
                <button
                  onClick={() => togglePinMessage(message._id)}
                  className={`size-6 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10 ml-1 mb-1 transition-opacity ${
                    hoveredId === message._id ? "opacity-100" : "opacity-0"
                  }`}
                  title={message.pinned ? "Unpin" : "Pin"}
                >
                  {message.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              )}

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
