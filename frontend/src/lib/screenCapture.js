// Screen capture for calls, on every platform:
//  - laptop/desktop browsers: the standard getDisplayMedia
//  - the Talkies Android app: a native plugin (MediaProjection) streams the
//    screen to the page, which turns it into a video track
//  - phone browsers: not possible (they don't implement screen capture at all)

export const ANDROID_APP_URL = "https://github.com/sujaytumu/Chat-App/releases/download/android-latest/talkies.apk";

export const hasNativeScreenShare = () =>
  typeof window !== "undefined" &&
  !!window.Capacitor?.isNativePlatform?.() &&
  !!window.Capacitor?.Plugins?.ScreenShare;

const isPhoneBrowser = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

// Can this device share its screen right now?
export const canCaptureScreen = () =>
  hasNativeScreenShare() || (!!navigator.mediaDevices?.getDisplayMedia && !isPhoneBrowser());

// Why not, for the toast on devices that can't.
export const noScreenShareMessage = () =>
  isPhoneBrowser()
    ? `Phone browsers can't share the screen. Install the Talkies Android app to share from your phone: ${ANDROID_APP_URL}`
    : "Screen sharing isn't supported in this browser. Use Chrome, Edge or Firefox on a computer.";

async function nativeScreenTrack() {
  const plugin = window.Capacitor.Plugins.ScreenShare;
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  const track = canvas.captureStream(10).getVideoTracks()[0];

  let closed = false;
  let decoding = false;
  let last = null;

  const frameHandle = await plugin.addListener("frame", ({ data, width, height }) => {
    if (decoding || closed) return; // never queue up frames — drop and take the next
    decoding = true;
    const img = new Image();
    img.onload = () => {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.drawImage(img, 0, 0, width, height);
      last = img;
      decoding = false;
    };
    img.onerror = () => {
      decoding = false;
    };
    img.src = `data:image/jpeg;base64,${data}`;
  });

  // A still screen produces no new frames; redraw so the stream stays alive.
  const keepAlive = setInterval(() => {
    if (last && !closed) ctx.drawImage(last, 0, 0, canvas.width, canvas.height);
  }, 1000);

  const finish = (stopNative) => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    frameHandle.remove();
    stoppedHandle.remove();
    if (stopNative) plugin.stop().catch(() => {});
  };

  // The user (notification "Stop sharing") or Android ended the capture
  const stoppedHandle = await plugin.addListener("stopped", () => {
    finish(false);
    track.dispatchEvent(new Event("ended")); // same signal a browser gives when sharing stops
  });

  const stopTrack = track.stop.bind(track);
  track.stop = () => {
    stopTrack();
    finish(true);
  };

  try {
    await plugin.start(); // shows Android's "Start recording or casting?" prompt
  } catch (err) {
    finish(false);
    stopTrack();
    const e = new Error(err?.message || "Couldn't start screen sharing");
    e.name = err?.message === "cancelled" ? "NotAllowedError" : "Error";
    throw e;
  }
  return track;
}

// Resolves to a live video track of the screen. Throws NotAllowedError if the
// person cancels the permission prompt.
export async function getScreenTrack() {
  if (hasNativeScreenShare()) return nativeScreenTrack();
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  return stream.getVideoTracks()[0];
}
