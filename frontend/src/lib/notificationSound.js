// Generates a short two-tone "ding" using the Web Audio API so we don't
// need to ship/license an audio asset.
let audioCtx;

// Browsers block Web Audio until a genuine user gesture (click/keydown/tap)
// happens on the page. Call this on that first gesture so the AudioContext
// is already running by the time a notification sound is actually needed —
// otherwise the very first notification after page load can play silently.
export function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    // ignore
  }
}

export function playNotificationSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const tones = [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1175, start: 0.1, duration: 0.18 },
    ];

    tones.forEach(({ freq, start, duration }) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    });
  } catch {
    // Audio isn't critical — fail silently (e.g. autoplay policy blocks it
    // until the user has interacted with the page once).
  }
}

export function playRingtone() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;

    // Classic dual-tone phone ring: two close frequencies mixed together,
    // played for ~1s, silence for ~1s — repeats every 2s via the caller's
    // setInterval, giving a "brrring… brrring…" cadence.
    [440, 480].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.05);
      gain.gain.setValueAtTime(0.13, now + 0.85);
      gain.gain.linearRampToValueAtTime(0, now + 1.0);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.05);
    });
  } catch {
    // ignore
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Registers the service worker and subscribes the browser to Web Push, so
// this device keeps getting notified even when the site/tab is fully closed
// (as long as the browser/OS is running). Safe to call repeatedly.
export async function registerPushSubscription(axiosInstance) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const { data } = await axiosInstance.get("/push/vapid-public-key");
    if (!data.publicKey) return; // backend not configured with VAPID keys yet

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    await axiosInstance.post("/push/subscribe", subscription.toJSON());
  } catch (err) {
    console.log("Push subscription failed:", err.message);
  }
}

export function showDesktopNotification(title, options) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // ignore
  }
}
