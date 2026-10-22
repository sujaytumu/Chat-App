// Microphone / camera for calls, with the Android app's permission quirks handled in one place.
// - Mic busy for a moment (NotReadableError / AbortError): try again shortly.
// - Permission denied inside the Android app: ask Android for it explicitly, then try once more.
// - Still denied: say clearly which permission is blocked and open the app's settings page.
import toast from "react-hot-toast";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nativePlugin = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesPush : null);

export function mediaErrorMessage(err, wantVideo) {
  const n = err?.name;
  if (n === "NotAllowedError" || n === "SecurityError") {
    return wantVideo
      ? "Talkies is blocked from the microphone or camera. Allow both in Settings → Permissions."
      : "Talkies is blocked from the microphone. Allow it in Settings → Permissions → Microphone.";
  }
  if (n === "NotFoundError") return "No microphone found on this device";
  if (n === "NotReadableError" || n === "AbortError") return "The microphone is being used by another app. Close it and try again.";
  return "Could not access the microphone";
}

// constraints: { audio, video }. Resolves with the stream or throws an Error with .mediaMessage.
export async function getCallStream(constraints) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error("insecure");
    e.mediaMessage = "Calls need a secure (https) connection";
    throw e;
  }
  const native = nativePlugin();
  let askedAndroid = false;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      const n = err?.name;
      if (n === "NotReadableError" || n === "AbortError") {
        await wait(700); // another app is holding the mic for a moment
        continue;
      }
      if ((n === "NotAllowedError" || n === "SecurityError") && native && !askedAndroid) {
        askedAndroid = true;
        try {
          await native.requestCallPermissions?.(); // shows Android's own prompt when it can
        } catch {
          /* ignore */
        }
        await wait(3000); // give the person time to answer that prompt
        continue;
      }
      break;
    }
  }
  const wantVideo = !!constraints?.video;
  const msg = mediaErrorMessage(lastErr, wantVideo);
  const e = new Error(msg); // readable wherever it is shown
  e.name = lastErr?.name || "Error";
  e.mediaMessage = msg;
  e.blocked = lastErr?.name === "NotAllowedError" || lastErr?.name === "SecurityError";
  throw e;
}

// Blocked for good: the only way out is the app's settings page (Android app only).
export function openPermissionSettings(err) {
  const native = nativePlugin();
  if (!native || !err?.blocked) return;
  setTimeout(() => {
    try {
      native.openAppSettings?.();
    } catch {
      /* ignore */
    }
  }, 1800);
}

// Call media with the video-to-audio fallback: { stream, videoDropped }.
export async function acquireCallMedia(audio, callType) {
  try {
    return { stream: await getCallStream({ audio, video: callType === "video" }), videoDropped: false };
  } catch (err) {
    if (callType === "video") {
      try {
        const stream = await getCallStream({ audio, video: false });
        toast("Camera unavailable — continuing with audio only", { icon: "📷" });
        return { stream, videoDropped: true };
      } catch {
        /* fall through to the original error */
      }
    }
    openPermissionSettings(err); // nothing works without the mic: take them to the settings page
    throw err;
  }
}
