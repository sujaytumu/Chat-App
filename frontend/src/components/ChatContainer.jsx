import { useChatStore } from "../store/useChatStore";
import { useChatWallpaperStyle } from "../lib/wallpaper";
import { useBackToClose } from "../lib/useBackToClose";
import { useEffect, useRef, useState, useMemo } from "react";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import ImageLightbox from "./ImageLightbox";
import MessageTicks, { GroupMessageTicks } from "./MessageTicks";
import AttachmentContent from "./AttachmentContent";
import LocationCard from "./LocationCard";
import ForwardMessageModal from "./ForwardMessageModal";
import MessageInfoModal from "./MessageInfoModal";
import { isStickerMessage, parseLocationMessage } from "../lib/messageFormat";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime, formatDateDivider, isDifferentDay } from "../lib/utils";
import { translateAndToast } from "../lib/translate";
import { Pin, X, ChevronDown } from "lucide-react";
import MessageActionMenu from "./MessageActionMenu";
import toast from "react-hot-toast";
import Avatar from "./Avatar";
import ChatSearchBar from "./ChatSearchBar";
import { optimizeImage } from "../lib/cdn";

// WhatsApp tints each person's name in a group differently.
const SENDER_COLORS = ["#25D366", "#53BDEB", "#E8A33D", "#B794F6", "#F472B6", "#A3E635"];
const colorForId = (id = "") =>
  SENDER_COLORS[[...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % SENDER_COLORS.length];

const ChatContainer = () => {
  const {
    messages: allMessages,
    isMessagesLoading,
    selectedChat,
    typingUsers,
    togglePinMessage,
    deleteMessage,
    setReplyingTo,
    toggleStarMessage,
    hasMoreMessages,
    isLoadingOlder,
    loadOlderMessages,
    chatSearchOpen,
    pendingJump,
    clearPendingJump,
    isFetchingMessages,
    reactToMessage,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const wallpaperStyle = useChatWallpaperStyle(selectedChat ? `${selectedChat.type}:${selectedChat.data._id}` : "");

  // Disappearing messages: hide each one the moment it expires (the server
  // also deletes it for good a little later).
  const [nowTick, setNowTick] = useState(() => Date.now());
  const hasExpiring = allMessages.some((m) => m.expiresAt);
  useEffect(() => {
    if (!hasExpiring) return;
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, [hasExpiring]);
  const messages = useMemo(
    () => (hasExpiring ? allMessages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > nowTick) : allMessages),
    [allMessages, hasExpiring, nowTick]
  );
  // Phone Back closes the in-chat search bar first (before leaving the chat).
  useBackToClose(chatSearchOpen, () => useChatStore.getState().setChatSearchOpen(false));
  const messageEndRef = useRef(null);
  const messageRefs = useRef({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const prevChatKeyRef = useRef(null);
  const justOpenedRef = useRef(false);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true); // is the reader at (or close to) the latest message?
  const [showJump, setShowJump] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [highlightId, setHighlightId] = useState(null);
  const jumpTries = useRef(0);
  const prependRef = useRef(null); // scroll position to restore after older messages are added on top

  // Scroll only the message list. scrollIntoView() also scrolls every ancestor —
  // including the page itself on phone browsers — which pushed the header out
  // of view.
  const scrollToBottom = (behavior = "auto") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

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
    // Older messages were just added above: keep the reader exactly where they
    // were instead of jumping (and don't count them as "new messages").
    if (prependRef.current && scrollRef.current) {
      const { height, top } = prependRef.current;
      prependRef.current = null;
      scrollRef.current.scrollTop = top + (scrollRef.current.scrollHeight - height);
      return;
    }
    // Jumping to a search result: don't fight it by scrolling to the bottom.
    if (useChatStore.getState().pendingJump) {
      prevChatKeyRef.current = `${selectedChat.type}:${data._id}`;
      return;
    }
    if (!messageEndRef.current) return;

    // Jump straight to the bottom instantly when a chat is first opened —
    // animating a smooth scroll through the whole history looks like a
    // random mid-chat jump/lag. Only new messages arriving in an already-
    // open chat get the smooth scroll.
    const chatKey = `${selectedChat.type}:${data._id}`;
    const isFreshOpen = prevChatKeyRef.current !== chatKey;
    prevChatKeyRef.current = chatKey;

    // Like WhatsApp: a new message only pulls the view down if the reader is
    // already at the bottom (or sent it themselves). Someone reading older
    // messages stays where they are and gets a "jump to latest" button with a
    // count instead of being yanked away.
    const last = messages[messages.length - 1];
    const sentByMe = last?.senderId === authUser._id;
    if (isFreshOpen || nearBottomRef.current || sentByMe) {
      scrollToBottom(isFreshOpen ? "auto" : "smooth");
      setNewWhileAway(0);
    } else if (last) {
      setNewWhileAway((n) => n + 1);
    }

    // Images/videos loading asynchronously after this point can grow the
    // content height and leave the "bottom" we just scrolled to stale —
    // keep re-anchoring for a moment after a fresh open so late-loading
    // media doesn't leave the view stuck partway up the conversation.
    if (isFreshOpen) {
      justOpenedRef.current = true;
      const timeout = setTimeout(() => {
        justOpenedRef.current = false;
      }, 1200);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isOtherTyping, selectedChat, data._id]);

  // Search result -> scroll to it. If it's older than what's loaded, keep
  // pulling older pages until it appears (bounded), then highlight it.
  useEffect(() => {
    if (!pendingJump) {
      jumpTries.current = 0;
      return;
    }
    const el = messageRefs.current[pendingJump.id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(pendingJump.id);
      clearPendingJump();
      setTimeout(() => setHighlightId(null), 2200);
      return;
    }
    if (isMessagesLoading || isFetchingMessages || isLoadingOlder) return;
    if (hasMoreMessages && jumpTries.current < 15) {
      jumpTries.current += 1;
      loadOlderMessages();
    } else {
      clearPendingJump();
      toast.error("Couldn't find that message");
    }
  }, [pendingJump, messages, isMessagesLoading, isFetchingMessages, isLoadingOlder, hasMoreMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadOlder = async () => {
    const el = scrollRef.current;
    if (el) prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
    const loaded = await loadOlderMessages();
    if (!loaded) prependRef.current = null;
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 160;
    setShowJump(distance > 360);
    if (distance < 160) setNewWhileAway(0);
  };

  const jumpToLatest = () => {
    scrollToBottom("smooth");
    setNewWhileAway(0);
  };

  const handleMediaLoaded = () => {
    if (justOpenedRef.current) {
      scrollToBottom("auto");
    }
  };

  const scrollToPinned = () => {
    if (pinnedMessage) {
      messageRefs.current[pinnedMessage._id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const scrollToMessage = (id) => {
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden chat-wallpaper" style={wallpaperStyle}>
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden chat-wallpaper min-w-0" style={wallpaperStyle}>
      <ChatHeader />
      {chatSearchOpen && <ChatSearchBar />}

      {pinnedMessage && (
        <button
          onClick={scrollToPinned}
          className="flex items-center gap-2 px-4 py-2 bg-wa-surface border-b border-white/5 text-left hover:bg-wa-hover transition-colors"
        >
          <Pin size={14} className="text-[#00A884] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#00A884]">Pinned message</p>
            <p className="text-sm truncate text-wa-text2">
              {pinnedMessage.image ? "📷 Photo" : pinnedMessage.file ? `📎 ${pinnedMessage.file.name}` : pinnedMessage.text}
            </p>
          </div>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePinMessage(pinnedMessage._id);
            }}
            className="size-6 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10 shrink-0"
            title="Unpin"
          >
            <X size={13} />
          </span>
        </button>
      )}

      <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ overflowAnchor: "none" }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-[5%] lg:px-8 py-3 lg:py-5 lg:[&>*]:w-full lg:[&>*]:max-w-[880px] lg:[&>*]:mx-auto"
      >
        {hasMoreMessages && (
          <div className="flex justify-center pb-3">
            <button
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
              className="bg-wa-surface/95 text-wa-muted hover:text-wa-text text-[13px] px-4 py-1.5 rounded-full shadow-sm disabled:opacity-60"
            >
              {isLoadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {messages.map((message, index) => {
          const isMe = message.senderId === authUser._id;
          const sender = isGroup ? membersById[message.senderId] : isMe ? authUser : data;
          const location = message.text ? parseLocationMessage(message.text) : null;
          const isSticker =
            !message.image && !message.file && !location && isStickerMessage(message.text);
          const replyFromMe = message.replyTo?.senderId === authUser._id;
          const replySender = message.replyTo
            ? isGroup
              ? membersById[message.replyTo.senderId]
              : replyFromMe
              ? authUser
              : data
            : null;
          const prev = messages[index - 1];
          const showDateDivider = index === 0 || isDifferentDay(prev.createdAt, message.createdAt);
          // The first bubble of a run from the same person gets a tail and a
          // little extra space above it, like WhatsApp.
          const isFirstInGroup = showDateDivider || !prev || prev.senderId !== message.senderId;
          const hasText = !!message.text && !location;

          const menuProps = {
            message,
            isMe,
            authUserId: authUser._id,
            visible: hoveredId === message._id,
            onTogglePin: () => togglePinMessage(message._id),
            onDelete: (mode) => deleteMessage(message._id, mode),
            onReply: () => setReplyingTo(message),
            onToggleStar: () => toggleStarMessage(message._id),
            onForward: () => setForwardingMessage(message),
            onInfo: () => setInfoMessage(message),
            onReact: (emoji) => reactToMessage(message._id, emoji),
            onTranslate: hasText ? () => translateAndToast(message.text) : undefined,
          };

          return (
            <div key={message._id} className={isFirstInGroup && !showDateDivider ? "mt-2 lg:mt-3.5" : "mt-0.5 lg:mt-1"}>
            {showDateDivider && (
              <div className="flex justify-center my-3 lg:my-5">
                <span className="bg-wa-surface/95 text-wa-muted text-[12.5px] lg:text-[13px] px-3 py-1 lg:px-3.5 lg:py-1.5 rounded-lg shadow-sm">
                  {formatDateDivider(message.createdAt)}
                </span>
              </div>
            )}
            <div
              ref={(el) => (messageRefs.current[message._id] = el)}
              className={`flex items-end group rounded-lg transition-colors duration-700 ${
                highlightId === message._id ? "bg-[#25D366]/20" : ""
              } ${isMe ? "justify-end" : "justify-start"}`}
              onMouseEnter={() => setHoveredId(message._id)}
              onMouseLeave={() => setHoveredId((id) => (id === message._id ? null : id))}
            >
              {isGroup && !isMe &&
                (isFirstInGroup ? (
                  <Avatar
                    src={sender?.profilePic}
                    name={sender?.fullName}
                    size="size-7"
                    textSize="text-xs"
                    className="mr-3 mb-0.5"
                  />
                ) : (
                  <div className="w-7 mr-3 shrink-0" />
                ))}

              {isMe && !message.deletedForEveryone && <MessageActionMenu {...menuProps} />}

              {message.deletedForEveryone ? (
                <div
                  className={`relative max-w-[82%] sm:max-w-[65%] px-3 py-1.5 rounded-xl italic text-wa-muted text-[14.5px] flex items-center gap-1.5 ${
                    isMe ? "bg-wa-out/70" : "bg-wa-surface/80"
                  } ${isFirstInGroup ? (isMe ? "rounded-tr-none" : "rounded-tl-none") : ""}`}
                >
                  🚫 This message was deleted
                </div>
              ) : isSticker ? (
                <div className="flex flex-col items-center px-1">
                  <span className="text-6xl leading-none">{message.text.trim()}</span>
                  <span className="text-[11px] text-wa-muted mt-1 flex items-center gap-1">
                    {formatMessageTime(message.createdAt)}
                    {isMe && !isGroup && <MessageTicks message={message} />}
                    {isMe && isGroup && (
                      <GroupMessageTicks message={message} members={data.members} senderId={authUser._id} />
                    )}
                  </span>
                </div>
              ) : (
                <div
                  className={`relative max-w-[82%] sm:max-w-[65%] lg:max-w-[68%] px-2.5 pt-1.5 pb-1.5 lg:px-3.5 lg:pt-2 lg:pb-2 rounded-xl break-words shadow-sm flex flex-col text-wa-text ${
                    isMe ? "bg-wa-out" : "bg-wa-surface"
                  } ${
                    isFirstInGroup ? (isMe ? "rounded-tr-none bubble-tail-out" : "rounded-tl-none bubble-tail-in") : ""
                  }`}
                >
                  {isGroup && !isMe && isFirstInGroup && (
                    <span
                      className="text-[13px] font-medium mb-0.5"
                      style={{ color: colorForId(message.senderId) }}
                    >
                      {sender?.fullName || "Unknown"}
                    </span>
                  )}
                  {message.pinned && (
                    <span className="flex items-center gap-1 text-[11px] mb-0.5 text-wa-muted">
                      <Pin size={10} /> Pinned
                    </span>
                  )}
                  {message.replyTo && (
                    <button
                      onClick={() => scrollToMessage(message.replyTo._id)}
                      className="flex flex-col items-start text-left w-full mb-1.5 pl-2.5 pr-2 py-1.5 rounded-lg bg-black/25 border-l-4 border-[#25D366]"
                    >
                      <span className="text-[13px] font-medium text-[#25D366]">
                        {replyFromMe ? "You" : replySender?.fullName || "Message"}
                      </span>
                      <span className="text-[13.5px] text-wa-icon line-clamp-2 break-all">
                        {message.replyTo.image ? "📷 Photo" : message.replyTo.file ? `📎 ${message.replyTo.file.name}` : message.replyTo.text}
                      </span>
                    </button>
                  )}
                  {message.image && (
                    <img
                      src={optimizeImage(message.image, 260)}
                      alt="Attachment"
                      loading="lazy"
                      decoding="async"
                      onLoad={handleMediaLoaded}
                      onClick={() => setLightboxSrc(message.image)}
                      className="max-w-full w-[260px] max-h-[320px] h-auto object-cover rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  )}
                  {message.file && <AttachmentContent file={message.file} onMediaLoaded={handleMediaLoaded} />}
                  {location ? (
                    <LocationCard location={location} />
                  ) : (
                    message.text && (
                      <span className="text-[15px] leading-[21px] lg:text-[15.5px] lg:leading-[23px]" style={{ whiteSpace: "pre-wrap" }}>
                        {message.text}
                        {/* reserves room so the last line never runs under the time */}
                        <span
                          aria-hidden="true"
                          className={`inline-block ${isMe ? "w-[66px]" : "w-[44px]"}`}
                        />
                      </span>
                    )
                  )}
                  <span
                    className={`${
                      hasText ? "absolute bottom-1 right-2 lg:bottom-1.5 lg:right-3" : "self-end mt-0.5"
                    } text-[11px] leading-none flex items-center gap-1 whitespace-nowrap text-wa-text/60`}
                  >
                    {formatMessageTime(message.createdAt)}
                    {isMe && !isGroup && <MessageTicks message={message} />}
                    {isMe && isGroup && (
                      <GroupMessageTicks message={message} members={data.members} senderId={authUser._id} />
                    )}
                  </span>
                </div>
              )}

              {!isMe && !message.deletedForEveryone && <MessageActionMenu {...menuProps} />}
            </div>
            {message.reactions?.length > 0 && !message.deletedForEveryone && (
              <div className={`relative z-10 flex -mt-1.5 mb-1.5 px-2 ${isMe ? "justify-end" : isGroup ? "justify-start pl-10" : "justify-start"}`}>
                <div className="flex items-center gap-1 bg-wa-surface border border-wa-bg rounded-full px-1.5 py-0.5 shadow-sm">
                  {Object.entries(
                    message.reactions.reduce((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] || 0) + 1 }), {})
                  ).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => reactToMessage(message._id, emoji)}
                      className="text-[14px] leading-none flex items-center gap-0.5"
                    >
                      {emoji}
                      {count > 1 && <span className="text-[11px] text-wa-muted">{count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div>
          );
        })}

        {isOtherTyping && (
          <div className="mt-2 inline-flex items-center gap-1 px-3.5 py-3 rounded-xl rounded-tl-none bg-wa-surface">
            <span className="size-2 rounded-full bg-wa-muted animate-bounce [animation-delay:-0.3s]" />
            <span className="size-2 rounded-full bg-wa-muted animate-bounce [animation-delay:-0.15s]" />
            <span className="size-2 rounded-full bg-wa-muted animate-bounce" />
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      {showJump && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 right-4 z-10 size-11 rounded-full bg-wa-surface text-wa-icon hover:bg-wa-field shadow-lg shadow-black/40 flex items-center justify-center transition-colors"
          aria-label="Jump to latest message"
        >
          <ChevronDown size={26} />
          {newWhileAway > 0 && (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 min-w-[20px] h-5 px-1.5 rounded-full bg-[#25D366] text-wa-bg text-[11px] font-bold flex items-center justify-center">
              {newWhileAway > 99 ? "99+" : newWhileAway}
            </span>
          )}
        </button>
      )}
      </div>

      {isGroup && data.permissions?.sendMessages === "admins" && !data.admins.some((a) => (a._id || a) === authUser._id) ? (
        <div className="shrink-0 px-4 py-3.5 text-center text-[14px] text-wa-muted bg-wa-panel border-t border-white/5">
          Only admins can send messages
        </div>
      ) : (
        <MessageInput />
      )}

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      {forwardingMessage && (
        <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />
      )}
      {infoMessage && <MessageInfoModal
          message={infoMessage}
          members={isGroup ? data.members : undefined}
          onClose={() => setInfoMessage(null)}
        />}
    </div>
  );
};

export default ChatContainer;
