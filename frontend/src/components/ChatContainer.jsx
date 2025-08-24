import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef } from "react";
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
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);

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
