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
  const groupStatus = useGroupCallStore((s) => s.status);
  const groupName = useGroupCallStore((s) => s.groupName);
  const groupVideo = useGroupCallStore((s) => s.cameraOn);

  const oneToOne = callStatus === "calling" || callStatus === "in-call";
  const group = groupStatus !== "idle";
  const active = oneToOne || group;
  const video = oneToOne ? callType === "video" : groupVideo;
  const title = oneToOne ? remoteName || "Talkies call" : groupName || "Group call";
  const text = oneToOne
    ? `${callType === "video" ? "Video" : "Voice"} call in progress`
    : "Group call in progress";

  useEffect(() => {
    const p = plugin();
    if (!p) return;
    if (active) p.start({ title, text, video }).catch(() => {});
    else p.stop().catch(() => {});
  }, [active, video, title, text]);

  useEffect(() => {
    const p = plugin();
    if (!p?.addListener) return;
    let handle;
    p.addListener("hangup", () => {
      if (useCallStore.getState().callStatus !== "idle") useCallStore.getState().endCall();
      if (useGroupCallStore.getState().status !== "idle") useGroupCallStore.getState().leave();
    }).then((h) => (handle = h));
    return () => handle?.remove?.();
  }, []);

  return null;
};

export default CallKeepAlive;
