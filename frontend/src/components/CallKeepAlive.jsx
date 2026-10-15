import { useEffect } from "react";
import { useCallStore } from "../store/useCallStore";
import { useGroupCallStore } from "../store/useGroupCallStore";

// Android app only. While a call is connected, tell the native side to run it
// as a foreground service so the microphone and the page keep working after you
// leave the app (Android otherwise silences the mic of a background app). Also
// wires the "Hang up" button on the ongoing-call notification.
const plugin = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesCall : null);

const CallKeepAlive = () => {
  const callStatus = useCallStore((s) => s.callStatus);
  const callType = useCallStore((s) => s.callType);
  const remoteName = useCallStore((s) => s.remoteUser?.fullName);
  const callStartedAt = useCallStore((s) => s.callStartedAt);
  const groupStatus = useGroupCallStore((s) => s.status);
  const groupStartedAt = useGroupCallStore((s) => (s.status === "active" ? s.startedAt : 0));
  const groupName = useGroupCallStore((s) => s.groupName);
  const groupVideo = useGroupCallStore((s) => s.cameraOn);

  const oneToOne = callStatus === "calling" || callStatus === "in-call";
  const group = groupStatus !== "idle";
  const active = oneToOne || group;
  const video = oneToOne ? callType === "video" : groupVideo;
  const title = oneToOne ? remoteName || "Talkies call" : groupName || "Group call";
  // Epoch ms the call connected: the notification then shows a live mm:ss timer.
  const startedAt = oneToOne ? (callStatus === "in-call" ? callStartedAt || Date.now() : 0) : groupStartedAt || 0;
  const kind = oneToOne ? (callType === "video" ? "Video call" : "Voice call") : "Group call";
  const text = startedAt ? kind : `${kind} · connecting…`;

  useEffect(() => {
    const p = plugin();
    if (!p) return;
    try {
      Promise.resolve(active ? p.start({ title, text, video, startedAt }) : p.stop()).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [active, video, title, text, startedAt]);

  // Like WhatsApp: video calls start on the loudspeaker, voice calls on the earpiece.
  useEffect(() => {
    const p = plugin();
    if (!p || !active || typeof p.setSpeaker !== "function") return;
    try {
      Promise.resolve(p.setSpeaker({ on: video }))
        .then(() => useCallStore.setState({ isSpeakerOn: video }))
        .catch(() => {});
    } catch {
      /* older app build without speaker control */
    }
  }, [active, video]);

  useEffect(() => {
    const p = plugin();
    if (!p?.addListener) return;
    let handle;
    let gone = false;
    try {
      // addListener may return a promise or the handle itself depending on the Capacitor version.
      Promise.resolve(
        p.addListener("hangup", () => {
          if (useCallStore.getState().callStatus !== "idle") useCallStore.getState().endCall();
          if (useGroupCallStore.getState().status !== "idle") useGroupCallStore.getState().leave();
        })
      )
        .then((h) => {
          handle = h;
          if (gone) h?.remove?.();
        })
        .catch(() => {});
    } catch {
      /* no native listener — the notification's Hang up simply won't reach the page */
    }
    return () => {
      gone = true;
      handle?.remove?.();
    };
  }, []);

  return null;
};

export default CallKeepAlive;
