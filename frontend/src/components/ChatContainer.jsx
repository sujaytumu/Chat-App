import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState } from "react";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    socket, // Assuming socket is exposed here or accessible via the store
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const [typingUsers, setTypingUsers] = useState(new Set());

  useEffect(() => {
    getMessages(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [selectedUser._id, getMessages, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Listen for typing events
  useEffect(() => {
    if (!socket) return;

    const handleTyping = ({ fromUserId }) => {
      if (fromUserId === selectedUser._id) {
        setTypingUsers((prev) => new Set(prev).add(fromUserId));
      }
    };

    const handleStopTyping = ({ fromUserId }) => {
      if (fromUserId === selectedUser._id) {
        setTypingUsers((prev) => {
          const copy = new Set(prev);
          copy.delete(fromUserId);
          return copy;
        });
      }
    };

    const handleMessageSeen = ({ messageId, seenBy }) => {
      // Optionally update message state to mark message as seen
      // This depends on your store update method - example:
      // updateMessageSeen(messageId, seenBy);
    };

    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("messageSeen", handleMessageSeen);

    return () => {
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("messageSeen", handleMessageSeen);
    };
  }, [socket, selectedUser._id]);

  // Emit messageSeen when messages from selectedUser are displayed
  useEffect(() => {
    if (!socket || !messages.length) return;

    // Collect messages sent by selectedUser that are not seen yet
    const unseenMessages = messages.filter(
      (msg) => msg.senderId === selectedUser._id && !msg.seen
    );

    unseenMessages.forEach((msg) => {
      socket.emit("messageSeen", { messageId: msg._id, fromUserId: msg.senderId });
      // Optionally update locally that this message has been seen to prevent duplicate emits
      // markMessageSeenLocally(msg._id);
    });
  }, [messages, selectedUser._id, socket]);

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
      {/* Typing indicator */}
      {typingUsers.has(selectedUser._id) && (
        <div className="px-4 text-sm italic text-gray-600">{selectedUser.name} is typing...</div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isMe = message.senderId === authUser._id;
          return (
            <div
              key={message._id}
              className={`flex items-end ${isMe ? "justify-end" : "justify-start"}`}
              ref={messageEndRef}
            >
              {!isMe && (
                <div className="w-8 h-8 rounded-full overflow-hidden mr-2">
                  <img
                    src={selectedUser.profilePic || "/avatar.png"}
                    alt="profile pic"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div
                className={`max-w-[45%] px-3 py-1.5 rounded-lg break-words shadow-sm flex items-end pl-3 ${
                  isMe
                    ? "bg-[#25D366] text-white rounded-br-none"
                    : "bg-white text-black rounded-bl-none"
                }`}
                style={{ whiteSpace: "pre-wrap" }}
              >
                {message.text}
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    className="sm:max-w-[150px] rounded-md mt-1"
                  />
                )}
                <span
                  className={`ml-2 text-[10px] leading-none flex-shrink-0 self-end whitespace-nowrap ${
                    isMe ? "text-white/80" : "text-black/60"
                  }`}
                  style={{ minWidth: "32px", textAlign: "right" }}
                >
                  {formatMessageTime(message.createdAt)}
                </span>
                {/* Show Seen indicator */}
                {isMe && message.seen && (
                  <span className="ml-1 text-[9px] leading-none self-end text-white/70">✓✓ Seen</span>
                )}
              </div>
              {isMe && (
                <div className="w-8 h-8 rounded-full overflow-hidden ml-2">
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
      </div>
      <MessageInput />
    </div>
  );
};

export default ChatContainer;
