import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

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
// soon as the socket connects). Never needs a second tap.
let lastAnswer = { from: "", at: 0 };
let chaseTimer = null;
let giveUpTimer = null;

function answerCall(callerId) {
  // The same "Answer" can reach the page twice (launch intent + live event): only act once.
  if (lastAnswer.from === callerId && Date.now() - lastAnswer.at < 4000) return;
  lastAnswer = { from: callerId, at: Date.now() };

  const { callStatus, remoteUser, acceptCall } = useCallStore.getState();
  if (callStatus === "incoming" && remoteUser?._id === callerId) {
    acceptCall();
    return;
  }
  // Already connected to this person (answered from the call screen first): nothing to do.
  if ((callStatus === "in-call" || callStatus === "calling") && remoteUser?._id === callerId) return;

  useCallStore.setState({ autoAnswer: { from: callerId, until: Date.now() + ANSWER_WINDOW_MS } });
  // Give up (and say so) if the call never reaches us, instead of leaving a stuck screen.
  clearTimeout(giveUpTimer);
  giveUpTimer = setTimeout(() => {
    const { autoAnswer, callStatus: st } = useCallStore.getState();
    if (autoAnswer && autoAnswer.from === callerId && st === "idle") {
      useCallStore.setState({ autoAnswer: null });
      toast("The call ended before it could connect", { icon: "📞" });
    }
  }, 30_000);

  // The server holds the call for a short while; ask for it again until it arrives (the socket may
  // still be reconnecting after the app was closed) so the call is picked up without another tap.
  clearInterval(chaseTimer);
  let tries = 0;
  chaseTimer = setInterval(() => {
    const { autoAnswer, callStatus: st } = useCallStore.getState();
    if (!autoAnswer || autoAnswer.from !== callerId || st !== "idle" || ++tries > 20) {
      clearInterval(chaseTimer);
      return;
    }
    useAuthStore.getState().socket?.emit?.("syncCalls");
  }, 1000);
  useAuthStore.getState().socket?.emit?.("syncCalls");
}

export function handleNotificationAction({ action, data = {} }, goHome) {
  if (data.callCode) {
    window.location.assign(`/call/${data.callCode}`); // scheduled-call reminder
    return;
  }
  if (action === "callback" && data.chatId) {
    // "Call back" on a missed-call notification: open the chat, then ring them straight away.
    let tries = 0;
    const t = setInterval(() => {
      const u = useChatStore.getState().users.find((x) => x._id === data.chatId);
      if (u) {
        clearInterval(t);
        goHome?.();
        if (useCallStore.getState().callStatus === "idle") useCallStore.getState().startCall(u, "audio");
      } else if (++tries > 40) clearInterval(t);
    }, 500);
    return;
  }
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
