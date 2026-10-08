import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";

// Handles taps on system notifications (messages and calls), whether the app
// was already open (the service worker posts a message) or was launched by the
// tap (the intent is in the URL: ?chat=<id>&type=direct|group&answer=<callerId>).

const ANSWER_WINDOW_MS = 60_000;

// Opens the chat once it's in the (possibly still loading) chat list.
function openChat(type, id, goHome) {
  const tryOpen = () => {
    const { users, groups, setSelectedChat } = useChatStore.getState();
    const data = type === "group" ? groups.find((g) => g._id === id) : users.find((u) => u._id === id);
    if (!data) return false;
    goHome?.();
    setSelectedChat({ type: type === "group" ? "group" : "direct", data });
    return true;
  };
  if (tryOpen()) return;
  let timer = null;
  const unsubscribe = useChatStore.subscribe(() => {
    if (tryOpen()) {
      unsubscribe();
      clearTimeout(timer);
    }
  });
  timer = setTimeout(unsubscribe, 10_000);
}

// "Answer" pressed on a call notification. If the call is already ringing here,
// pick it up now; otherwise remember the intent so the call is answered the
// moment it arrives (e.g. the app was closed and the server hands it over as
// soon as the socket connects).
function answerCall(callerId) {
  const { callStatus, remoteUser, acceptCall } = useCallStore.getState();
  if (callStatus === "incoming" && remoteUser?._id === callerId) {
    acceptCall();
    return;
  }
  useCallStore.setState({ autoAnswer: { from: callerId, until: Date.now() + ANSWER_WINDOW_MS } });
}

export function handleNotificationAction({ action, data = {} }, goHome) {
  if (data.isCall || action === "answer") {
    if (action === "answer" && data.callerId) answerCall(data.callerId);
    return; // the incoming-call screen handles the rest
  }
  if (data.chatId) openChat(data.chatType, data.chatId, goHome);
}

export function startNotificationActionListener(goHome) {
  const onMessage = (event) => {
    if (event.data?.type === "notification-click") handleNotificationAction(event.data, goHome);
  };
  navigator.serviceWorker?.addEventListener("message", onMessage);

  // Launched by a notification tap: read the intent from the URL, then tidy it.
  const params = new URLSearchParams(window.location.search);
  const chat = params.get("chat");
  const type = params.get("type");
  const answer = params.get("answer");
  if (chat || answer) {
    handleNotificationAction(
      {
        action: answer ? "answer" : "open",
        data: { chatId: chat, chatType: type, callerId: answer, isCall: !!answer },
      },
      goHome
    );
    window.history.replaceState(null, "", window.location.pathname);
  }

  return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
}
