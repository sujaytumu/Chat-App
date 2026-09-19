import { THEMES } from "../constants";
import { useThemeStore } from "../store/useThemeStore";
import { Send, Bell, BellOff, BellRing, Download, CheckCircle2, Volume2, VolumeX, Phone, PhoneOff } from "lucide-react";
import { useEffect, useState } from "react";
import { registerPushSubscription, playNotificationSound, playRingtone } from "../lib/notificationSound";
import {
  isMessageSoundEnabled,
  setMessageSoundEnabled,
  isCallRingtoneEnabled,
  setCallRingtoneEnabled,
} from "../lib/soundSettings";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

const PREVIEW_MESSAGES = [
  { id: 1, content: "Hey! How's it going?", isSent: false },
  { id: 2, content: "I'm doing great! Just working on some new features.", isSent: true },
];

const NotificationSettings = () => {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEnable = async () => {
    if (typeof Notification === "undefined") return;
    setIsEnabling(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await registerPushSubscription(axiosInstance);
        toast.success("Notifications enabled");
      } else if (result === "denied") {
        toast.error("Notifications blocked — enable them in your browser's site settings");
      }
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#DCF8C6]">
      <div className="flex items-center gap-3">
        {permission === "granted" ? (
          <BellRing className="text-green-700 shrink-0" size={22} />
        ) : permission === "denied" ? (
          <BellOff className="text-red-600 shrink-0" size={22} />
        ) : (
          <Bell className="text-zinc-600 shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Notifications</h3>
          <p className="text-xs text-zinc-600">
            {permission === "granted" && "Enabled — you'll get sound + popup alerts, even with the app closed."}
            {permission === "denied" &&
              "Blocked. Click the lock/info icon in your browser's address bar → Notifications → Allow, then reload."}
            {permission === "default" && "Not enabled yet — click to allow notifications."}
            {permission === "unsupported" && "Not supported in this browser."}
          </p>
        </div>
      </div>
      {permission === "default" && (
        <button
          onClick={handleEnable}
          disabled={isEnabling}
          className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none shrink-0"
        >
          {isEnabling ? "Enabling…" : "Enable"}
        </button>
      )}
    </div>
  );
};

const InstallAppControl = () => {
  const { isInstalled, promptInstall } = useInstallPrompt();
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("App installed");
    else if (outcome === "unavailable" && isIOS) {
      toast("On iPhone/iPad: tap Share, then 'Add to Home Screen'", { icon: "📲", duration: 5000 });
    } else if (outcome === "unavailable") {
      toast("Look for an install icon in your browser's address bar", { icon: "📲", duration: 5000 });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#DCF8C6]">
      <div className="flex items-center gap-3">
        {isInstalled ? (
          <CheckCircle2 className="text-green-700 shrink-0" size={22} />
        ) : (
          <Download className="text-zinc-600 shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Install app</h3>
          <p className="text-xs text-zinc-600">
            {isInstalled
              ? "Already installed — opens like a native app from your home screen."
              : isIOS
              ? "iPhone/iPad: tap Share → Add to Home Screen for the best notification support."
              : "Install for quicker access and more reliable notifications."}
          </p>
        </div>
      </div>
      {!isInstalled && !isIOS && (
        <button
          onClick={handleInstall}
          className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none shrink-0"
        >
          Install
        </button>
      )}
    </div>
  );
};

const SoundSettings = () => {
  const [messageSound, setMessageSound] = useState(isMessageSoundEnabled());
  const [ringtone, setRingtone] = useState(isCallRingtoneEnabled());

  const handleToggleMessage = () => {
    const next = !messageSound;
    setMessageSound(next);
    setMessageSoundEnabled(next);
    if (next) playNotificationSound();
  };

  const handleToggleRingtone = () => {
    const next = !ringtone;
    setRingtone(next);
    setCallRingtoneEnabled(next);
    if (next) playRingtone();
  };

  return (
    <div className="p-4 rounded-xl bg-[#DCF8C6] space-y-3">
      <h3 className="font-semibold text-sm">Sounds</h3>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {messageSound ? <Volume2 size={18} className="text-green-700" /> : <VolumeX size={18} className="text-zinc-500" />}
          <span className="text-sm">Message notification sound</span>
        </div>
        <input type="checkbox" className="toggle toggle-success toggle-sm" checked={messageSound} onChange={handleToggleMessage} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {ringtone ? <Phone size={18} className="text-green-700" /> : <PhoneOff size={18} className="text-zinc-500" />}
          <span className="text-sm">Call ringtone</span>
        </div>
        <input type="checkbox" className="toggle toggle-success toggle-sm" checked={ringtone} onChange={handleToggleRingtone} />
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="min-h-screen pt-20 bg-[#ECE5DD]"> {/* ✅ full page bg */}
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-6 bg-[#DCF8C6] p-6 rounded-xl shadow-lg"> {/* ✅ inner card bg */}
          <NotificationSettings />
          <SoundSettings />
          <InstallAppControl />

          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Theme</h2>
            <p className="text-sm text-base-content/70">Choose a theme for your chat interface</p>
          </div>

          {/* Theme Selection */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                className={`
                  group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
                  ${theme === t ? "ring-2 ring-offset-2 ring-green-600" : "hover:bg-[#ECE5DD]"}
                `}
                onClick={() => setTheme(t)}
                data-theme={t}
              >
                <div className="relative h-8 w-full rounded-md overflow-hidden">
                  <div className="absolute inset-0 grid grid-cols-4 gap-px p-1">
                    <div className="rounded bg-primary"></div>
                    <div className="rounded bg-secondary"></div>
                    <div className="rounded bg-accent"></div>
                    <div className="rounded bg-neutral"></div>
                  </div>
                </div>
                <span className="text-[11px] font-medium truncate w-full text-center">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </span>
              </button>
            ))}
          </div>

          {/* Preview Section */}
          <h3 className="text-lg font-semibold mb-3">Preview</h3>
          <div className="rounded-xl border border-green-300 overflow-hidden bg-[#ECE5DD] shadow-md">
            <div className="p-4 bg-[#DCF8C6]">
              <div className="max-w-lg mx-auto">
                {/* Mock Chat UI */}
                <div className="bg-[#ECE5DD] rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-green-300 bg-[#DCF8C6]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content font-medium">
                        J
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">John Doe</h3>
                        <p className="text-xs text-green-700">Online</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-4 min-h-[200px] max-h-[200px] overflow-y-auto bg-[#ECE5DD]">
                    {PREVIEW_MESSAGES.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.isSent ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`
                            max-w-[80%] rounded-xl p-3 shadow-sm
                            ${message.isSent ? "bg-green-500 text-white" : "bg-[#DCF8C6]"}
                          `}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p
                            className={`
                              text-[10px] mt-1.5
                              ${message.isSent ? "text-white/70" : "text-green-700/70"}
                            `}
                          >
                            12:00 PM
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 border-t border-green-300 bg-[#DCF8C6]">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input input-bordered flex-1 text-sm h-10 bg-[#ECE5DD]"
                        placeholder="Type a message..."
                        value="This is a preview"
                        readOnly
                      />
                      <button className="btn bg-green-500 hover:bg-green-600 text-white h-10 min-h-0">
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;


