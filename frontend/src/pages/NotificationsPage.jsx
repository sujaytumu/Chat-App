import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, MoreVertical, Music, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import SettingsShell, { Switch } from "../components/SettingsShell";
import { axiosInstance } from "../lib/axios";
import { registerPushSubscription, previewCallTone, previewMessageTone, stopTonePreview } from "../lib/notificationSound";
import { useBackToClose } from "../lib/useBackToClose";
import {
  isMessageSoundEnabled,
  setMessageSoundEnabled,
  isCallRingtoneEnabled,
  setCallRingtoneEnabled,
  CALL_TONES,
  MESSAGE_TONES,
  VIBRATIONS,
  getCallTone,
  setCallTone,
  getMessageTone,
  setMessageTone,
  getGroupTone,
  setGroupTone,
  getVibration,
  setVibration,
  vibrationPattern,
  getCustomToneName,
  saveCustomTone,
  removeCustomTone,
  resetNotificationSettings,
  MAX_CUSTOM_TONE_BYTES,
} from "../lib/soundSettings";

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
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-wa-surface">
      <div className="flex items-center gap-3">
        {permission === "granted" ? (
          <BellRing className="text-[#25D366] shrink-0" size={22} />
        ) : permission === "denied" ? (
          <BellOff className="text-red-400 shrink-0" size={22} />
        ) : (
          <Bell className="text-wa-muted shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Notifications</h3>
          <p className="text-xs text-wa-muted">
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


// ---------- WhatsApp-style rows and dialog ----------
const Section = ({ children }) => <p className="px-4 pt-5 pb-1 text-[13px] text-wa-muted">{children}</p>;
const Divider = () => <div className="h-px bg-white/5 mt-2" />;

const Row = ({ title, sub, onClick }) => (
  <button type="button" onClick={onClick} className="w-full px-4 py-4 text-left hover:bg-white/5 active:bg-wa-surface transition-colors">
    <span className="block text-[14.5px] leading-[22px] text-wa-text">{title}</span>
    <span className="block text-[12.5px] leading-5 text-wa-muted mt-0.5">{sub}</span>
  </button>
);

const Radio = ({ on }) => (
  <span className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "border-[#21C063]" : "border-wa-muted"}`}>
    {on && <span className="size-2.5 rounded-full bg-[#21C063]" />}
  </span>
);

// Pick-one dialog. Tapping an option previews it; OK saves it.
const ChoiceDialog = ({ title, options, value, onPreview, onSave, onClose, kind, allowCustom, onCustomChange }) => {
  const [sel, setSel] = useState(value);
  const [customName, setCustomName] = useState(kind ? getCustomToneName(kind) : "");
  const fileRef = useRef(null);

  useEffect(() => stopTonePreview, []);

  const pick = (id) => {
    setSel(id);
    onPreview?.(id);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_CUSTOM_TONE_BYTES) return toast.error("That file is too large — pick one under 4 MB");
    try {
      await saveCustomTone(kind, file);
      setCustomName(file.name);
      onCustomChange?.();
      pick("custom");
    } catch (err) {
      toast.error(err.message || "Couldn't save that sound");
    }
  };

  const removeCustom = async () => {
    await removeCustomTone(kind);
    setCustomName("");
    onCustomChange?.();
    if (sel === "custom") setSel(options[0].id);
    stopTonePreview();
  };

  const all = customName ? [...options, { id: "custom", label: `My sound: ${customName}` }] : options;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-wa-pop rounded-3xl pt-6 pb-3 shadow-2xl max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="px-6 text-[17px] text-wa-text mb-3">{title}</h3>
        <div className="overflow-y-auto flex-1">
          {all.map((o) => (
            <button key={o.id} type="button" onClick={() => pick(o.id)} className="w-full flex items-center gap-4 px-6 py-3 text-left hover:bg-white/5">
              <Radio on={sel === o.id} />
              <span className="text-[13.5px] text-wa-text truncate">{o.label}</span>
            </button>
          ))}
          {allowCustom && (
            <div className="flex items-center gap-2 px-6 py-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 text-[12.5px] text-[#21C063] py-2">
                <Music size={16} /> {customName ? "Choose a different sound" : "Choose from this device"}
              </button>
              {customName && (
                <button type="button" onClick={removeCustom} className="ml-auto text-red-400 p-2" aria-label="Remove my sound">
                  <Trash2 size={16} />
                </button>
              )}
              <input ref={fileRef} type="file" accept="audio/*,video/mp4,video/mpeg,video/webm,.mp3,.mp4,.m4a,.mpeg,.mpg,.mpga,.aac,.wav,.ogg,.oga,.opus,.flac,.weba,.3gp,.amr" className="hidden" onChange={onFile} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 pt-2">
          <button onClick={onClose} className="h-10 px-4 rounded-full text-[#21C063] font-medium hover:bg-white/5">Cancel</button>
          <button
            onClick={() => {
              onSave(sel);
              onClose();
            }}
            className="h-10 px-4 rounded-full text-[#21C063] font-medium hover:bg-white/5"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

const toneLabel = (list, id, kind) => {
  if (id === "custom") return `My sound: ${getCustomToneName(kind) || "custom"}`;
  return list.find((t) => t.id === id)?.label || list[0].label;
};
const vibLabel = (kind) => VIBRATIONS.find((v) => v.id === getVibration(kind))?.label || "Default";

export const NotificationsPage = () => {
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [dialog, setDialog] = useState(null); // "msgTone" | "msgVib" | "grpTone" | "grpVib" | "callTone" | "callVib"
  const [menu, setMenu] = useState(false);
  useBackToClose(menu, () => setMenu(false));
  const [resetKey, setResetKey] = useState(0);

  const convTones = isMessageSoundEnabled();
  const callSilent = !isCallRingtoneEnabled();

  const vibDialog = (kind, title) => (
    <ChoiceDialog
      title={title}
      options={VIBRATIONS}
      value={getVibration(kind)}
      onPreview={(id) => {
        const p = vibrationPattern(kind, id);
        if (p) navigator.vibrate?.(p);
      }}
      onSave={(id) => {
        setVibration(kind, id);
        refresh();
      }}
      onClose={() => setDialog(null)}
    />
  );

  const groupOptions = [{ id: "same", label: "Same as messages" }, { id: "none", label: "Silent" }, ...MESSAGE_TONES];
  const callOptions = [{ id: "none", label: "Silent" }, ...CALL_TONES];

  return (
    <SettingsShell
      title="Notifications"
      flush
      right={
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="More options">
            <MoreVertical size={24} />
          </button>
          {menu && (
            <div className="absolute right-2 top-full mt-1 w-64 bg-wa-pop rounded-2xl shadow-2xl py-2 z-30">
              <button
                className="w-full px-4 py-3 text-[13px] text-wa-text text-left hover:bg-white/5"
                onClick={async () => {
                  setMenu(false);
                  await resetNotificationSettings();
                  setResetKey((k) => k + 1);
                  toast("Notification settings reset");
                }}
              >
                Reset notification settings
              </button>
            </div>
          )}
        </div>
      }
    >
      <div key={resetKey}>
        <div className="px-4 pt-2 pb-2">
          <NotificationSettings />
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={convTones}
          onClick={() => {
            setMessageSoundEnabled(!convTones);
            refresh();
          }}
          className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-white/5"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] leading-[22px] text-wa-text">Conversation tones</span>
            <span className="block text-[12.5px] leading-5 text-wa-muted mt-0.5">Play sounds for incoming messages.</span>
          </span>
          <Switch checked={convTones} />
        </button>

        <Divider />
        <Section>Messages</Section>
        <Row title="Notification tone" sub={toneLabel(MESSAGE_TONES, getMessageTone(), "message")} onClick={() => setDialog("msgTone")} />
        <Row title="Vibrate" sub={vibLabel("message")} onClick={() => setDialog("msgVib")} />

        <Divider />
        <Section>Groups</Section>
        <Row title="Notification tone" sub={getGroupTone() === "same" ? "Same as messages" : getGroupTone() === "none" ? "Silent" : toneLabel(MESSAGE_TONES, getGroupTone(), "group")} onClick={() => setDialog("grpTone")} />
        <Row title="Vibrate" sub={vibLabel("group")} onClick={() => setDialog("grpVib")} />

        <Divider />
        <Section>Calls</Section>
        <Row title="Ringtone" sub={callSilent ? "Silent" : toneLabel(CALL_TONES, getCallTone(), "call")} onClick={() => setDialog("callTone")} />
        <Row title="Vibrate" sub={vibLabel("call")} onClick={() => setDialog("callVib")} />
      </div>

      {dialog === "msgTone" && (
        <ChoiceDialog
          title="Notification tone"
          options={MESSAGE_TONES}
          value={getMessageTone()}
          kind="message"
          allowCustom
          onCustomChange={refresh}
          onPreview={(id) => previewMessageTone(id, "message")}
          onSave={(id) => {
            setMessageTone(id);
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "grpTone" && (
        <ChoiceDialog
          title="Notification tone"
          options={groupOptions}
          value={getGroupTone()}
          kind="group"
          allowCustom
          onCustomChange={refresh}
          onPreview={(id) => (id === "same" || id === "none" ? stopTonePreview() : previewMessageTone(id, "group"))}
          onSave={(id) => {
            setGroupTone(id);
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "callTone" && (
        <ChoiceDialog
          title="Ringtone"
          options={callOptions}
          value={callSilent ? "none" : getCallTone()}
          kind="call"
          allowCustom
          onCustomChange={refresh}
          onPreview={(id) => (id === "none" ? stopTonePreview() : previewCallTone(id))}
          onSave={(id) => {
            if (id === "none") setCallRingtoneEnabled(false);
            else {
              setCallRingtoneEnabled(true);
              setCallTone(id);
            }
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "msgVib" && vibDialog("message", "Vibrate")}
      {dialog === "grpVib" && vibDialog("group", "Vibrate")}
      {dialog === "callVib" && vibDialog("call", "Vibrate")}
    </SettingsShell>
  );
};

export default NotificationsPage;
