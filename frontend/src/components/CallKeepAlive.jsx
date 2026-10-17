import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
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

  // Phones like Realme/Oppo/Xiaomi stop apps in the background, so calls/messages never arrive once
  // the app is closed. Ask once (every few days at most) to let Talkies run in the background.
  useEffect(() => {
    const p = plugin();
    if (!p || typeof p.batteryStatus !== "function" || typeof p.requestBatteryUnrestricted !== "function") return;
    let cancelled = false;
    (async () => {
      try {
        const last = Number(localStorage.getItem("talkies.batteryAsked") || 0);
        if (Date.now() - last < 3 * 24 * 3600 * 1000) return;
        const st = await p.batteryStatus();
        if (cancelled || st?.unrestricted) return;
        localStorage.setItem("talkies.batteryAsked", String(Date.now()));
        toast(
          (t) => (
            <span className="text-[14px]">
              Allow Talkies to run in the background so calls and messages reach you when the app is closed.
              <button
                className="ml-3 px-3 py-1 rounded-full bg-[#25D366] text-[#0b141a] font-medium"
                onClick={() => {
                  toast.dismiss(t.id);
                  Promise.resolve(p.requestBatteryUnrestricted()).catch(() => {});
                }}
              >
                Allow
              </button>
            </span>
          ),
          { duration: 15000 }
        );
      } catch {
        /* older app build */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once per call (not on every video toggle): a connected headset wins, otherwise video calls
  // start on the speaker and voice calls on the phone. After that the person decides — the old
  // code re-forced the speaker on every change, which is why the audio kept jumping around.
  const videoRef = useRef(video);
  videoRef.current = video;
  useEffect(() => {
    const p = plugin();
    if (!p || !active) return;
    if (typeof p.initCallAudio === "function") {
      Promise.resolve(p.initCallAudio({ video: videoRef.current }))
        .then(() => setTimeout(() => useCallStore.getState().refreshAudioRoutes(), 900))
        .catch(() => {});
    } else if (typeof p.setSpeaker === "function") {
      Promise.resolve(p.setSpeaker({ on: videoRef.current }))
        .then(() => useCallStore.setState({ isSpeakerOn: videoRef.current }))
        .catch(() => {});
    }
  }, [active]);

  // headset plugged in / Bluetooth connected or lost: keep the picker and button in step
  useEffect(() => {
    const p = plugin();
    if (!p?.addListener) return;
    let handle;
    let gone = false;
    try {
      Promise.resolve(p.addListener("audioRoutes", (d) => useCallStore.getState().setAudioRoutes(d)))
        .then((h) => {
          handle = h;
          if (gone) h?.remove?.();
        })
        .catch(() => {});
    } catch {
      /* older app build */
    }
    return () => {
      gone = true;
      handle?.remove?.();
    };
  }, []);

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
