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
import MessageContextMenu from "./MessageContextMenu";
import PinDurationSheet from "./PinDurationSheet";
import { isPinned } from "../lib/pin";
import { isDesktopNow } from "./ContextMenu";
import { emojiOnlyCount, emojiFontSize, parseLocationMessage } from "../lib/messageFormat";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime, formatDateDivider, isDifferentDay } from "../lib/utils";
import { translateAndToast } from "../lib/translate";
import { Pin, X, ChevronDown } from "lucide-react";
import { VanishPullIndicator, VanishBottomHint, VanishNotice, VanishIntro } from "./VanishPull";
import MentionText from "./MentionText";
import ReactionsSheet from "./ReactionsSheet";
import { renderFormatted } from "../lib/richText";
import { useChatColorStore } from "../store/useChatColorStore";
import { useShallow } from "zustand/react/shallow";
import { useChatThemeStore, resolveLook } from "../store/useChatThemeStore";
import { getTheme, getFont, themeStyle, themeBarHex, loadChatFont } from "../lib/chatThemes";
import { useStatusBarColor } from "../lib/useStatusBarColor";
import { Forward } from "./icons/WaGlyphs";
import LinkPreview, { firstLink } from "./LinkPreview";
import PollCard from "./PollCard";
import EventCard from "./EventCard";
import LiveLocationCard from "./LiveLocationCard";
import ReminderSheet from "./ReminderSheet";
import { stopLiveShare } from "./LiveLocationManager";
import { replyWithPhoto } from "../lib/replyWithPhoto";
import ContactCard from "./ContactCard";
import toast from "react-hot-toast";
import Avatar from "./Avatar";
import ChatSearchBar from "./ChatSearchBar";
import { optimizeImage } from "../lib/cdn";

// WhatsApp tints each person's name in a group differently.
const SENDER_COLORS = ["#25D366", "#53BDEB", "#E8A33D", "#B794F6", "#F472B6", "#A3E635"];
const THEMED_SENDER_COLORS = ["#9BF6B8", "#9EDCFF", "#FFD28A", "#D8C2FF", "#FFB3D9", "#D4F28A"];
const colorForId = (id = "", themed = false) => {
  const list = themed ? THEMED_SENDER_COLORS : SENDER_COLORS;
  return list[[...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % list.length];
};

// While a themed chat is open the phone's status bar takes the header colour (handed back on close).
const ThemeStatusBar = ({ color }) => {
  useStatusBarColor(color, true);
  return null;
};

const READ_MORE_AT = 700; // longer messages fold up with a "Read more" link

const ChatContainer = () => {
  const {
    messages: allMessages,
    isMessagesLoading,
    selectedChat,
    selectedMsgIds,
    toggleSelectMessage,
    typingUsers,
    togglePinMessage,
    deleteMessage,
    setReplyingTo,
    setEditingMessage,
    setSelectedChat,
    toggleStarMessage,
    hasMoreMessages,
    isLoadingOlder,
    loadOlderMessages,
    chatSearchOpen,
    pendingJump,
    clearPendingJump,
    isFetchingMessages,
    reactToMessage,
    openViewOnce,
    votePoll,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const wallpaperStyle = useChatWallpaperStyle(selectedChat ? `${selectedChat.type}:${selectedChat.data._id}` : "");
  // Instagram-style theme + font for this chat (a live "Preview" wins over the saved choice)
  const themeKey = selectedChat ? `${selectedChat.type}:${selectedChat.data._id}` : "";
  const look = useChatThemeStore(useShallow((s) => resolveLook(s, themeKey)));
  const activeTheme = getTheme(look.theme);
  const activeFont = getFont(look.font);
  useEffect(() => loadChatFont(activeFont), [activeFont]);
  const chatThemeStyle = activeTheme || activeFont ? themeStyle(activeTheme, activeFont) : null;
  const chatLook = { ...(activeTheme ? {} : wallpaperStyle), ...(chatThemeStyle || {}), ...(activeFont ? { fontFamily: activeFont.css } : {}) };
  const chatDarkClass = activeTheme ? " wa-dark chat-themed" : "";

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
  // Swipe a message to the right to reply, like WhatsApp.
  const swipe = useRef({ x: 0, y: 0, on: false, dx: 0 });
  const lp = useRef({ timer: null, fired: false, moved: false });
  const lastTap = useRef({ id: null, t: 0 });
  const [heartFor, setHeartFor] = useState(null);
  const [reminderFor, setReminderFor] = useState(null);
  // Double-tap a message to ❤️ it.
  const heartMessage = (m) => {
    if (m.deletedForEveryone || useChatStore.getState().selectedMsgIds.length) return;
    setHeartFor(m._id);
    setTimeout(() => setHeartFor((id) => (id === m._id ? null : id)), 750);
    if (!m.reactions?.some((r) => String(r.user) === String(authUser._id) && r.emoji === "❤️")) reactToMessage(m._id, "❤️");
  };
  const lpCancel = () => clearTimeout(lp.current.timer);
  const swipeStart = (e, id) => {
    lp.current.fired = false;
    lp.current.moved = false;
    lpCancel();
    if (id) {
      lp.current.timer = setTimeout(() => {
        lp.current.fired = true;
        navigator.vibrate?.(15);
        if (!useChatStore.getState().selectedMsgIds.includes(id)) useChatStore.getState().toggleSelectMessage(id);
      }, 450);
    }
    if (useChatStore.getState().selectedMsgIds.length) return;
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, on: false, dx: 0 };
    e.currentTarget.style.transition = "none";
  };
  const swipeMove = (e) => {
    const t = e.touches[0];
    const sw = swipe.current;
    const dx = t.clientX - sw.x;
    const dy = t.clientY - sw.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      lpCancel();
      lp.current.moved = true;
    }
    if (lp.current.fired || useChatStore.getState().selectedMsgIds.length) return;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (sw.x = Infinity);
      if (dx > 12 && dx > Math.abs(dy) * 1.5) sw.on = true;
      else return;
    }
    if (sw.x === Infinity) return;
    sw.dx = Math.min(dx, 90);
    e.currentTarget.style.translate = `${Math.max(sw.dx, 0) * 0.8}px 0`;
  };
  const swipeEnd = (e, onReply, onDoubleTap, id) => {
    lpCancel();
    if (lp.current.fired) return;
    if (onDoubleTap && id && !lp.current.moved && e.type === "touchend") {
      const now = Date.now();
      if (lastTap.current.id === id && now - lastTap.current.t < 300) {
        lastTap.current = { id: null, t: 0 };
        onDoubleTap();
      } else lastTap.current = { id, t: now };
    }
    const el = e.currentTarget;
    const sw = swipe.current;
    el.style.transition = "translate .2s cubic-bezier(.2,.8,.2,1)";
    el.style.translate = "0 0";
    setTimeout(() => (el.style.transition = ""), 260);
    if (sw.on && sw.dx > 56 && onReply) {
      navigator.vibrate?.(12);
      onReply();
    }
    swipe.current = { x: 0, y: 0, on: false, dx: 0 };
  };
  const chatKeyNow = selectedChat ? `${selectedChat.type}:${selectedChat.data._id}` : null;
  const ownColor = useChatColorStore((s) => (selectedChat ? s.map[`${selectedChat.type === "group" ? "g" : "d"}:${selectedChat.data._id}`] : undefined));
  const [reactionsFor, setReactionsFor] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  // "N unread messages" divider: remembered when the chat is opened, before they are marked read.
  const [unreadMark, setUnreadMark] = useState({ key: null, id: null, count: 0 });
  // Closing the chat forgets the divider; reopening it starts clean.
  useEffect(() => {
    if (!chatKeyNow) setUnreadMark((m) => (m.key ? { key: null, id: null, count: 0 } : m));
  }, [chatKeyNow]);
  useEffect(() => {
    if (!chatKeyNow || unreadMark.key === chatKeyNow || !allMessages.length || isMessagesLoading) return;
    const me = authUser._id;
    const unread = allMessages.filter((m) => m.senderId !== me && !m.deletedForEveryone && (selectedChat.type === "group" ? !m.seenBy?.includes(me) : !m.seen));
    setUnreadMark({ key: chatKeyNow, id: unread[0]?._id || null, count: unread.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKeyNow, allMessages, isMessagesLoading]);
  const unreadDividerId = unreadMark.key === chatKeyNow ? unreadMark.id : null;

  // Bubbles that arrive while the chat is open ease in; the ones already there don't animate.
  const freshRef = useRef({ key: null, ids: new Set() });
  if (freshRef.current.key !== chatKeyNow) freshRef.current = { key: chatKeyNow, ids: new Set(messages.map((m) => m._id)) };
  const seenIds = freshRef.current.ids;
  const isFreshMsg = (id) => seenIds.size > 0 && !seenIds.has(id);
  useEffect(() => {
    const t = setTimeout(() => messages.forEach((m) => seenIds.add(m._id)), 400);
    return () => clearTimeout(t);
  }, [messages, seenIds]);
  // Phone Back closes the in-chat search bar first (before leaving the chat).
  useBackToClose(chatSearchOpen, () => useChatStore.getState().setChatSearchOpen(false));
  const messageEndRef = useRef(null);
  const messageRefs = useRef({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const galleryImages = useMemo(() => messages.filter((m) => m.image && !m.viewOnce && !m.deletedForEveryone).map((m) => m.image), [messages]);
  const [hoveredId, setHoveredId] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const pinPicker = useChatStore((s) => s.pinPicker);
  const [ctxMenu, setCtxMenu] = useState(null); // laptop: { message, isMe, menu, x, y, align }
  const [infoMessage, setInfoMessage] = useState(null);
  const prevChatKeyRef = useRef(null);
  const justOpenedRef = useRef(false);
  const scrollRef = useRef(null);
  // Instagram-style Vanish mode: pull up past the bottom of a 1:1 chat and let go to switch it on / off
  const vanishPeer = selectedChat?.type === "direct" && selectedChat.data._id !== authUser?._id ? selectedChat.data._id : null;
  const vanishOn = useChatStore((s) => (vanishPeer ? !!s.directVanish[vanishPeer] : false));
  const [vanishPx, setVanishPx] = useState(0); // how far the chat has been pulled up (px)
  const vanishPull = Math.min(vanishPx / 100, 1); // 0..1 — 1 means "let go now"
  const pullStart = useRef(null);
  const onPullStart = (e) => {
    const el = scrollRef.current;
    pullStart.current = vanishPeer && el && el.scrollHeight - el.scrollTop - el.clientHeight < 3 ? e.touches[0].clientY : null;
  };
  const onPullMove = (e) => {
    if (pullStart.current == null) return;
    const dy = pullStart.current - e.touches[0].clientY;
    setVanishPx(dy > 8 ? Math.min((dy - 8) * 0.8, 130) : 0); // the chat follows the finger, with a little resistance
  };
  const [showVanishIntro, setShowVanishIntro] = useState(false);
  const [vanishBusy, setVanishBusy] = useState(null); // "on" | "off" while the switch is being made
  const onPullEnd = async () => {
    const done = vanishPull >= 1;
    pullStart.current = null;
    setVanishPx(0);
    if (done && vanishPeer && !vanishBusy) {
      let seenIntro = true;
      try { seenIntro = localStorage.getItem("talkies-vanish-intro") === "1"; } catch { /* ignore */ }
      if (!seenIntro && !vanishOn) {
        setShowVanishIntro(true); // first time: explain, and OK turns it on
        return;
      }
      try {
        navigator.vibrate?.(20);
      } catch {
        /* no haptics */
      }
      const started = Date.now();
      setVanishBusy(vanishOn ? "off" : "on");
      await useChatStore.getState().setDirectVanish(vanishPeer, !vanishOn);
      // keep the spinner up long enough to be seen, like Instagram's
      setTimeout(() => setVanishBusy(null), Math.max(0, 650 - (Date.now() - started)));
    }
  };
  const nearBottomRef = useRef(true); // is the reader at (or close to) the latest message?
  const [showJump, setShowJump] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [highlightId, setHighlightId] = useState(null);
  const [heartPopId, setHeartPopId] = useState(null); // message that just got a double-tap heart
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
    const pinned = messages.filter((m) => isPinned(m));
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
      <div className={`flex-1 flex flex-col overflow-hidden chat-wallpaper${chatDarkClass}`} style={chatLook}>
        {activeTheme && <ThemeStatusBar color={themeBarHex(activeTheme)} />}
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden chat-wallpaper min-w-0${chatDarkClass}`} style={chatLook} data-chat-color={activeTheme ? undefined : ownColor || undefined}>
      {activeTheme && <ThemeStatusBar color={themeBarHex(activeTheme)} />}
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

      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {vanishPeer && (
        // Vanish mode turns the chat dark, like Instagram
        <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-500 ${vanishOn ? "opacity-75" : "opacity-0"}`} />
      )}
      {showVanishIntro && (
        <VanishIntro
          onClose={() => setShowVanishIntro(false)}
          onOk={async () => {
            try { localStorage.setItem("talkies-vanish-intro", "1"); } catch { /* ignore */ }
            setShowVanishIntro(false);
            if (vanishPeer) {
              setVanishBusy("on");
              await useChatStore.getState().setDirectVanish(vanishPeer, true);
              setTimeout(() => setVanishBusy(null), 650);
            }
          }}
        />
      )}
      {vanishPeer && (vanishPx > 0 || vanishBusy) && (
        <VanishPullIndicator
          px={vanishBusy ? 92 : vanishPx}
          pull={vanishPull}
          busy={!!vanishBusy}
          turningOn={vanishBusy ? vanishBusy === "on" : !vanishOn}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={onPullStart}
        onTouchMove={onPullMove}
        onTouchEnd={onPullEnd}
        onTouchCancel={onPullEnd}
        style={{
          overflowAnchor: "none",
          transform: vanishPeer && (vanishPx > 0 || vanishBusy) ? `translateY(${-(vanishBusy ? 92 : vanishPx)}px)` : undefined,
          transition: vanishPx > 0 && !vanishBusy ? undefined : "transform 280ms cubic-bezier(.2,.8,.2,1)",
        }}
        className="relative flex-1 overflow-y-auto overscroll-contain px-3 sm:px-[5%] lg:px-8 py-3 lg:py-5 lg:[&>*]:w-full lg:[&>*]:max-w-[880px] lg:[&>*]:mx-auto"
      >
        {hasMoreMessages && (
          <div className="flex justify-center pb-3">
            <button
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
              className="bg-wa-surface/95 text-wa-muted hover:text-wa-text text-[11px] px-4 py-1.5 rounded-full shadow-sm disabled:opacity-60"
            >
              {isLoadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {messages.map((message, index) => {
          const isMe = message.senderId === authUser._id;
          if (message.system) {
            return (
              <VanishNotice
                key={message._id}
                message={message}
                mine={isMe}
                name={data?.fullName}
                onToggle={() => vanishPeer && useChatStore.getState().setDirectVanish(vanishPeer, message.system !== "vanish_on")}
              />
            );
          }
          const sender = isGroup ? membersById[message.senderId] : isMe ? authUser : data;
          const location = message.text ? parseLocationMessage(message.text) : null;
          // emoji-only text stays in the normal bubble (like WhatsApp), just a bit larger
          const emojiPx =
            !message.image && !message.file && !location && !message.replyTo && !message.mentions?.length
              ? emojiFontSize(emojiOnlyCount(message.text))
              : null;
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
          const hasText = !!message.text && !location && !message.poll && !message.event && !message.liveLocation && !message.contact;

          const menuProps = {
            message,
            isMe,
            authUserId: authUser._id,
            visible: hoveredId === message._id,
            onTogglePin: () => useChatStore.getState().requestPin(message),
            onDelete: (mode) => deleteMessage(message._id, mode),
            onReply: () => setReplyingTo(message),
            onReplyPhoto: () => replyWithPhoto(message),
            onToggleStar: () => toggleStarMessage(message._id),
            onForward: () => setForwardingMessage(message),
            onInfo: () => setInfoMessage(message),
            onReact: (emoji) => reactToMessage(message._id, emoji),
            onSelect: () => toggleSelectMessage(message._id),
            onEdit:
              isMe && hasText && !message.file && !message.deletedForEveryone && Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000
                ? () => setEditingMessage(message)
                : undefined,
            onTranslate: hasText ? () => translateAndToast(message.text) : undefined,
            onRemind: !message.deletedForEveryone ? () => setReminderFor(message) : undefined,
          };

          return (
            <div key={message._id} className={`${isFirstInGroup && !showDateDivider ? "mt-2 lg:mt-3.5" : "mt-0.5 lg:mt-1"}${isFreshMsg(message._id) ? " msg-in" : ""}`}>
            {unreadDividerId === message._id && unreadMark.count > 0 && (
              <div className="flex justify-center my-3">
                <span className="px-3 py-1 rounded-lg bg-wa-surface/90 text-wa-muted text-[11.5px] uppercase tracking-wide">
                  {unreadMark.count} unread message{unreadMark.count > 1 ? "s" : ""}
                </span>
              </div>
            )}
            {showDateDivider && (
              <div className="flex justify-center my-3 lg:my-5">
                <span className="bg-wa-surface/95 text-wa-muted text-[10.5px] lg:text-[13px] px-3 py-1 lg:px-3.5 lg:py-1.5 rounded-lg shadow-sm">
                  {formatDateDivider(message.createdAt)}
                </span>
              </div>
            )}
            <div
              ref={(el) => (messageRefs.current[message._id] = el)}
              className={`msg-row relative flex items-end group rounded-lg transition-colors duration-700 ${
                highlightId === message._id || selectedMsgIds.includes(message._id) ? "bg-[#25D366]/20" : ""
              } ${isMe ? "justify-end" : "justify-start"}`}
              onMouseEnter={() => setHoveredId(message._id)}
              onMouseLeave={() => setHoveredId((id) => (id === message._id ? null : id))}
              style={{ touchAction: "pan-y" }}
              onTouchStart={(e) => swipeStart(e, message._id)}
              onTouchMove={swipeMove}
              onTouchEnd={(e) => swipeEnd(e, message.deletedForEveryone ? undefined : () => setReplyingTo(message), () => heartMessage(message), message._id)}
              onDoubleClick={() => heartMessage(message)}
              onTouchCancel={(e) => swipeEnd(e)}
              onContextMenu={(e) => {
                e.preventDefault();
                // laptop: right-click opens WhatsApp Web's menu; phones keep long-press selection + the bar on top
                if (isDesktopNow() && !selectedMsgIds.length && !message.deletedForEveryone) {
                  setCtxMenu({ message, isMe, menu: menuProps, x: e.clientX, y: e.clientY, align: "left" });
                  return;
                }
                if (!selectedMsgIds.includes(message._id)) toggleSelectMessage(message._id);
              }}
              onClickCapture={(e) => {
                if (lp.current.fired) {
                  lp.current.fired = false;
                  e.preventDefault();
                  e.stopPropagation();
                } else if (selectedMsgIds.length) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSelectMessage(message._id);
                }
              }}
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

              {isMe && (message.image || message.file || message.forwarded || firstLink(message.text)) && !message.deletedForEveryone && !message.viewOnce && !message.poll && !message.event && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setForwardingMessage(message);
                  }}
                  className="self-center shrink-0 mx-1.5 size-8 rounded-full bg-black/35 text-white flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="Forward"
                >
                  <Forward size={17} />
                </button>
              )}

              {heartFor === message._id && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 text-[44px] leading-none" style={{ animation: "m-heart .75s ease-out forwards" }}>
                  ❤️
                </span>
              )}
              {message.deletedForEveryone ? (
                <div
                  className={`relative max-w-[82%] sm:max-w-[65%] px-3 py-1.5 rounded-xl italic text-wa-muted text-[12.5px] flex items-center gap-1.5 ${
                    isMe ? "bg-wa-out/70" : "bg-wa-surface/80"
                  } ${isFirstInGroup ? (isMe ? "rounded-tr-none" : "rounded-tl-none") : ""}`}
                >
                  🚫 This message was deleted
                </div>
              ) : (
                <div
                  // Double-tap / double-click a message to heart it
                  onDoubleClick={() => {
                    if (message.deletedForEveryone) return;
                    const mine = (message.reactions || []).find((r) => String(r.user) === String(authUser._id));
                    if (mine?.emoji !== "❤️") reactToMessage(message._id, "❤️"); // never un-hearts by accident
                    setHeartPopId(message._id);
                    setTimeout(() => setHeartPopId((cur) => (cur === message._id ? null : cur)), 750);
                  }}
                  onMouseDown={(e) => {
                    if (e.detail > 1) e.preventDefault(); // no word-selection flash on the 2nd click
                  }}
                  className={`relative max-w-[82%] sm:max-w-[65%] lg:max-w-[68%] px-2.5 pt-1.5 pb-1.5 lg:px-3.5 lg:pt-2 lg:pb-2 rounded-xl break-words shadow-sm flex flex-col text-wa-text ${
                    isMe ? "bg-wa-out" : "bg-wa-surface"
                  } ${
                    isFirstInGroup ? (isMe ? "rounded-tr-none bubble-tail-out" : "rounded-tl-none bubble-tail-in") : ""
                  }`}
                >
                  {isGroup && !isMe && isFirstInGroup && (
                    <span
                      className="text-[11px] font-medium mb-0.5"
                      style={{ color: colorForId(message.senderId, !!activeTheme) }}
                    >
                      {sender?.fullName || "Unknown"}
                    </span>
                  )}
                  {/* laptop: the little arrow WhatsApp Web shows on hover */}
                  {!selectedMsgIds.length && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setCtxMenu({ message, isMe, menu: menuProps, x: isMe ? r.right : r.left, y: r.bottom + 4, align: isMe ? "right" : "left" });
                      }}
                      className={`hidden lg:flex absolute top-0 right-0 z-10 h-7 w-9 items-center justify-end pr-1.5 rounded-tr-xl opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-wa-text/70 hover:text-wa-text bg-gradient-to-l to-transparent ${
                        isMe ? "from-wa-out via-wa-out/90" : "from-wa-surface via-wa-surface/90"
                      }`}
                      aria-label="Message options"
                    >
                      <ChevronDown size={18} />
                    </button>
                  )}
                  {heartPopId === message._id && (
                    <span
                      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-5xl animate-[heartpop_0.5s_ease-out]"
                      aria-hidden="true"
                    >
                      ❤️
                    </span>
                  )}
                  {message.forwarded && (
                    <span className="flex items-center gap-1 text-[10.5px] italic mb-0.5 text-wa-muted">
                      <Forward size={12} /> Forwarded
                    </span>
                  )}
                  {isPinned(message) && (
                    <span className="flex items-center gap-1 text-[9.4px] mb-0.5 text-wa-muted">
                      <Pin size={10} /> Pinned
                    </span>
                  )}
                  {message.statusReply && (
                    <div className="flex items-stretch w-full mb-1.5 rounded-lg bg-black/25 border-l-4 border-[#25D366] overflow-hidden">
                      <div className="flex-1 min-w-0 px-2.5 py-1.5">
                        <span className="block text-[11.5px] font-medium text-[#25D366]">{isMe ? "Status" : "Replied to your status"}</span>
                        <span className="block text-[11.5px] text-wa-icon line-clamp-2 break-words">
                          {message.statusReply.kind === "image" ? "📷 Photo" : message.statusReply.kind === "text" ? message.statusReply.preview : message.statusReply.preview || "Status"}
                        </span>
                      </div>
                      {message.statusReply.kind === "image" && message.statusReply.preview && (
                        <img src={optimizeImage(message.statusReply.preview, 120)} alt="" className="size-12 object-cover shrink-0" loading="lazy" />
                      )}
                      {message.statusReply.kind === "text" && <span className="w-1.5 shrink-0" style={{ background: message.statusReply.color || "#00A884" }} />}
                    </div>
                  )}
                  {message.replyTo && (
                    <button
                      onClick={() => scrollToMessage(message.replyTo._id)}
                      className="flex flex-col items-start text-left w-full mb-1.5 pl-2.5 pr-2 py-1.5 rounded-lg bg-black/25 border-l-4 border-[#25D366]"
                    >
                      <span className="text-[11px] font-medium text-[#25D366]">
                        {replyFromMe ? "You" : replySender?.fullName || "Message"}
                      </span>
                      <span className="text-[11.5px] text-wa-icon line-clamp-2 break-all">
                        {message.replyTo.image ? "📷 Photo" : message.replyTo.file ? `📎 ${message.replyTo.file.name}` : message.replyTo.text}
                      </span>
                    </button>
                  )}
                  {message.viewOnce && (
                    <button
                      type="button"
                      disabled={message.viewOnceOpened || isMe}
                      onClick={async () => {
                        const url = await openViewOnce(message._id);
                        if (url) setLightboxSrc(url);
                      }}
                      className={`flex items-center gap-2 py-0.5 text-[13px] ${message.viewOnceOpened ? "text-wa-muted" : "text-wa-text"}`}
                    >
                      <span className="size-[22px] shrink-0 rounded-full border-[1.5px] border-dashed border-current flex items-center justify-center text-[10.5px] font-semibold leading-none">
                        {message.viewOnceOpened ? "✓" : "1"}
                      </span>
                      <span>{message.viewOnceOpened ? "Opened" : isMe ? "Photo" : "Tap to view photo"}</span>
                      {/* room for the time, which sits on the same line */}
                      <span aria-hidden="true" className={`inline-block ${isMe ? "w-[58px]" : "w-[38px]"}`} />
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
                  {message.file && <AttachmentContent file={message.file} incoming={!isMe} onMediaLoaded={handleMediaLoaded} messageId={message._id} transcript={message.transcript?.text} />}
                  {message.contact ? (
                    <ContactCard
                      contact={message.contact}
                      isMe={isMe}
                      onMessage={() => {
                        const u = useChatStore.getState().users.find((x) => x._id === message.contact.userId);
                        if (u && u._id !== authUser._id) setSelectedChat({ type: "direct", data: u });
                        else toast("That's you");
                      }}
                    />
                  ) : message.liveLocation ? (
                    <LiveLocationCard message={message} isMe={isMe} onStop={() => stopLiveShare(message._id)} />
                  ) : message.event ? (
                    <EventCard message={message} authUserId={authUser._id} onRsvp={(a) => useChatStore.getState().rsvpEvent(message._id, a)} />
                  ) : message.poll ? (
                    <PollCard message={message} authUserId={authUser._id} onVote={(ids) => votePoll(message._id, ids)} />
                  ) : location ? (
                    <LocationCard location={location} />
                  ) : (
                    message.text && (
                      <>
                      {!message.deletedForEveryone && !message.viewOnce && firstLink(message.text) && <LinkPreview url={firstLink(message.text)} />}
                      <span
                        className={`msg-text ${emojiPx ? "" : "text-[13px] leading-[21px] lg:text-[15.5px] lg:leading-[23px]"}`}
                        style={emojiPx ? { whiteSpace: "pre-wrap", fontSize: emojiPx, lineHeight: `${Math.round(emojiPx * 1.2)}px` } : { whiteSpace: "pre-wrap" }}
                      >
                        {(() => {
                          const long = message.text.length > READ_MORE_AT && !expandedIds.has(message._id);
                          const shown = long ? `${message.text.slice(0, READ_MORE_AT).trimEnd()}…` : message.text;
                          return (
                            <>
                              {message.mentions?.length ? <MentionText text={shown} mentions={message.mentions} members={data.members} /> : renderFormatted(shown)}
                              {long && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedIds((prev) => new Set(prev).add(message._id));
                                  }}
                                  className="block mt-0.5 text-[13px] text-[#53BDEB]"
                                >
                                  Read more
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {/* reserves room so the last line never runs under the time */}
                        <span
                          aria-hidden="true"
                          className={`inline-block ${isMe ? (message.editedAt ? "w-[108px]" : "w-[66px]") : message.editedAt ? "w-[86px]" : "w-[44px]"}`}
                        />
                      </span>
                      </>
                    )
                  )}
                  <span
                    className={`${
                      hasText || (message.viewOnce && !message.image) ? "absolute bottom-1 right-2 lg:bottom-1.5 lg:right-3" : "self-end mt-0.5"
                    } text-[10.5px] lg:text-[11px] leading-none flex items-center gap-1 whitespace-nowrap text-wa-text/75`}
                  >
                    {message.editedAt && <span>Edited</span>}
                    {formatMessageTime(message.createdAt)}
                    {isMe && !isGroup && <MessageTicks message={message} />}
                    {isMe && isGroup && (
                      <GroupMessageTicks message={message} members={data.members} senderId={authUser._id} />
                    )}
                  </span>
                </div>
              )}

              {!isMe && (message.image || message.file || message.forwarded || firstLink(message.text)) && !message.deletedForEveryone && !message.viewOnce && !message.poll && !message.event && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setForwardingMessage(message);
                  }}
                  className="self-center shrink-0 mx-1.5 size-8 rounded-full bg-black/35 text-white flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="Forward"
                >
                  <Forward size={17} />
                </button>
              )}
            </div>
            {message.reactions?.length > 0 && !message.deletedForEveryone && (
              <div className={`relative z-10 flex -mt-1.5 mb-1.5 px-2 ${isMe ? "justify-end" : isGroup ? "justify-start pl-10" : "justify-start"}`}>
                <button
                  onClick={() => setReactionsFor(message._id)}
                  className="flex items-center gap-1 bg-wa-surface border border-wa-bg rounded-full px-1.5 py-0.5 shadow-sm"
                  aria-label="See who reacted"
                >
                  {Object.entries(
                    message.reactions.reduce((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] || 0) + 1 }), {})
                  ).map(([emoji, count]) => (
                    <span key={emoji} className="text-[12px] leading-none flex items-center gap-0.5">
                      {emoji}
                      {count > 1 && <span className="text-[9.4px] text-wa-muted">{count}</span>}
                    </span>
                  ))}
                </button>
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
        {vanishPeer && vanishPx === 0 && !vanishBusy && <VanishBottomHint on={vanishOn} />}
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
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 min-w-[20px] h-5 px-1.5 rounded-full bg-[#25D366] text-wa-bg text-[9.4px] font-bold flex items-center justify-center">
              {newWhileAway > 99 ? "99+" : newWhileAway}
            </span>
          )}
        </button>
      )}
      </div>

      {isGroup && data.permissions?.sendMessages === "admins" && !data.admins.some((a) => (a._id || a) === authUser._id) ? (
        <div className="shrink-0 px-4 py-3.5 text-center text-[12px] text-wa-muted bg-wa-panel border-t border-white/5">
          Only admins can send messages
        </div>
      ) : (
        <MessageInput />
      )}

      {reactionsFor && (() => {
        const rm = allMessages.find((m) => m._id === reactionsFor);
        if (!rm || !rm.reactions?.length) return null;
        return (
          <ReactionsSheet
            message={rm}
            meId={authUser._id}
            resolveUser={(id) => (String(id) === String(authUser._id) ? authUser : isGroup ? membersById[id] : data)}
            onRemove={(emoji) => reactToMessage(rm._id, emoji)}
            onClose={() => setReactionsFor(null)}
          />
        );
      })()}
      <ImageLightbox src={lightboxSrc} gallery={galleryImages} onClose={() => setLightboxSrc(null)} />
      {forwardingMessage && (
        <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />
      )}
      {pinPicker && <PinDurationSheet message={pinPicker} onClose={() => useChatStore.setState({ pinPicker: null })} />}
      {ctxMenu && (
        <MessageContextMenu
          message={ctxMenu.message}
          isMe={ctxMenu.isMe}
          authUserId={authUser._id}
          menu={ctxMenu.menu}
          x={ctxMenu.x}
          y={ctxMenu.y}
          align={ctxMenu.align}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {reminderFor && <ReminderSheet message={reminderFor} onClose={() => setReminderFor(null)} />}
      {infoMessage && <MessageInfoModal
          message={infoMessage}
          members={isGroup ? data.members : undefined}
          onClose={() => setInfoMessage(null)}
        />}
    </div>
  );
};

export default ChatContainer;
