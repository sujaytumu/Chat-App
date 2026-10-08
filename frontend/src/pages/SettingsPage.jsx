import { THEMES } from "../constants";
import { useThemeStore } from "../store/useThemeStore";
import {
  Bell,
  BellOff,
  BellRing,
  Download,
  CheckCircle2,
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  Play,
  Music,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { registerPushSubscription, previewCallTone, previewMessageTone, stopTonePreview } from "../lib/notificationSound";
import {
  isMessageSoundEnabled,
  setMessageSoundEnabled,
  isCallRingtoneEnabled,
  setCallRingtoneEnabled,
  CALL_TONES,
  MESSAGE_TONES,
  getCallTone,
  setCallTone,
  getMessageTone,
  setMessageTone,
  getCustomToneName,
  saveCustomTone,
  removeCustomTone,
  MAX_CUSTOM_TONE_BYTES,
} from "../lib/soundSettings";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

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
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#1F2C34]">
      <div className="flex items-center gap-3">
        {permission === "granted" ? (
          <BellRing className="text-[#25D366] shrink-0" size={22} />
        ) : permission === "denied" ? (
          <BellOff className="text-red-400 shrink-0" size={22} />
        ) : (
          <Bell className="text-[#8696A0] shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Notifications</h3>
          <p className="text-xs text-[#8696A0]">
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
          className="btn btn-sm bg-[#00A884] hover:bg-[#02906f] text-white border-none shrink-0"
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
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#1F2C34]">
      <div className="flex items-center gap-3">
        {isInstalled ? (
          <CheckCircle2 className="text-[#25D366] shrink-0" size={22} />
        ) : (
          <Download className="text-[#8696A0] shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Install app</h3>
          <p className="text-xs text-[#8696A0]">
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
          className="btn btn-sm bg-[#00A884] hover:bg-[#02906f] text-white border-none shrink-0"
        >
          Install
        </button>
      )}
    </div>
  );
};

// One row for a sound setting: on/off switch, a tone list with preview, and
// the option to pick the person's own audio file from their device.
const TonePicker = ({ kind, label, Icon, IconOff, enabled, onToggle, tones, getTone, setTone, preview }) => {
  const [tone, setToneState] = useState(getTone());
  const [customName, setCustomName] = useState(getCustomToneName(kind));
  const fileInputRef = useRef(null);

  const choose = (id) => {
    setToneState(id);
    setTone(id);
    preview(id);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (file.size > MAX_CUSTOM_TONE_BYTES) {
      toast.error("That file is too large — pick one under 4 MB");
      return;
    }
    try {
      await saveCustomTone(kind, file);
      setCustomName(file.name);
      choose("custom");
      toast.success("Sound saved on this device");
    } catch (err) {
      toast.error(err.message || "Couldn't save that sound");
    }
  };

  const handleRemoveCustom = async () => {
    await removeCustomTone(kind);
    setCustomName("");
    if (tone === "custom") {
      const fallback = tones[0].id;
      setToneState(fallback);
      setTone(fallback);
    }
    stopTonePreview();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {enabled ? <Icon size={18} className="text-[#25D366]" /> : <IconOff size={18} className="text-zinc-500" />}
          <span className="text-sm">{label}</span>
        </div>
        <input type="checkbox" className="toggle toggle-success toggle-sm" checked={enabled} onChange={onToggle} />
      </div>

      {enabled && (
        <div className="pl-7 space-y-2">
          <div className="flex items-center gap-2">
            <select
              className="select select-sm select-bordered flex-1 min-w-0 bg-[#2A3942] text-[#E9EDEF] border-[#2A3942]"
              value={tone}
              onChange={(e) => choose(e.target.value)}
            >
              {tones.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              {customName && <option value="custom">My sound: {customName}</option>}
            </select>
            <button
              type="button"
              onClick={() => preview(tone)}
              className="btn btn-sm btn-circle bg-[#00A884] hover:bg-[#02906f] text-white border-none shrink-0"
              aria-label="Play this sound"
            >
              <Play size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-xs btn-outline gap-1.5 border-[#3B4A54] text-[#E9EDEF] hover:bg-white/10 hover:border-[#3B4A54]"
            >
              <Music size={12} /> {customName ? "Choose a different sound" : "Choose a sound from this device"}
            </button>
            {customName && (
              <button
                type="button"
                onClick={handleRemoveCustom}
                className="btn btn-xs btn-ghost text-red-400 gap-1"
                aria-label="Remove my sound"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
          </div>
        </div>
      )}
    </div>
  );
};

const SoundSettings = () => {
  const [messageSound, setMessageSound] = useState(isMessageSoundEnabled());
  const [ringtone, setRingtone] = useState(isCallRingtoneEnabled());

  // Don't leave a preview playing when leaving the page.
  useEffect(() => stopTonePreview, []);

  const handleToggleMessage = () => {
    const next = !messageSound;
    setMessageSound(next);
    setMessageSoundEnabled(next);
    if (next) previewMessageTone(getMessageTone());
  };

  const handleToggleRingtone = () => {
    const next = !ringtone;
    setRingtone(next);
    setCallRingtoneEnabled(next);
    if (next) previewCallTone(getCallTone());
  };

  return (
    <div className="p-4 rounded-xl bg-[#1F2C34] space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Sounds</h3>
        <p className="text-xs text-[#8696A0]">
          Saved on this device — set it on your phone and laptop separately.
        </p>
      </div>

      <TonePicker
        kind="message"
        label="Message notification sound"
        Icon={Volume2}
        IconOff={VolumeX}
        enabled={messageSound}
        onToggle={handleToggleMessage}
        tones={MESSAGE_TONES}
        getTone={getMessageTone}
        setTone={setMessageTone}
        preview={previewMessageTone}
      />

      <TonePicker
        kind="call"
        label="Call ringtone"
        Icon={Phone}
        IconOff={PhoneOff}
        enabled={ringtone}
        onToggle={handleToggleRingtone}
        tones={CALL_TONES}
        getTone={getCallTone}
        setTone={setCallTone}
        preview={previewCallTone}
      />
    </div>
  );
};

const SettingsPage = () => {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="min-h-[100dvh] pt-20 pb-8 bg-[#0B141A] text-[#E9EDEF]">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <div className="space-y-4 bg-[#111B21] p-3 sm:p-5 rounded-2xl">
          <NotificationSettings />
          <SoundSettings />
          <InstallAppControl />

          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Theme</h2>
            <p className="text-sm text-[#8696A0]">Choose a theme for your chat interface</p>
          </div>

          {/* Theme Selection */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                className={`
                  group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
                  ${theme === t ? "ring-2 ring-offset-2 ring-offset-[#111B21] ring-[#25D366]" : "hover:bg-white/5"}
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
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;


