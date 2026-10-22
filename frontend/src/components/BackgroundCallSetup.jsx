import { useEffect, useState } from "react";
import { PhoneIncoming, BatteryCharging, Rocket, MonitorSmartphone, Cloud, Smartphone, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";
import { forceRegisterNativePush } from "../lib/nativePush";

// Android app only. Phones from Samsung, Realme, Redmi, POCO, Xiaomi, Oppo, Vivo and others kill closed apps and hide
// call screens unless a few switches are on. This sheet shows what is still off and opens
// each setting in one tap. It appears once in a while until everything is allowed.
const SNOOZE_KEY = "talkies-bgcall-snooze";

// Where each phone brand hides the switches that stop it killing a closed app. The model code in the
// browser string tells us the brand (SM- Samsung, RMX Realme, CPH Oppo, Redmi / POCO / Xiaomi, vivo).
function brandTip() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/sm-|samsung/.test(ua)) return "Samsung: Settings → Battery → Background usage limits → Never sleeping apps → add Talkies";
  if (/rmx|realme/.test(ua)) return "Realme: Settings → Apps → Talkies → Auto-launch ON, Battery usage → Allow background activity";
  if (/poco/.test(ua)) return "POCO: Security → Autostart → Talkies ON; Apps → Talkies → Battery saver → No restrictions";
  if (/redmi|xiaomi|mi |miui|hyperos/.test(ua)) return "Redmi/Xiaomi: Security → Autostart → Talkies ON; Apps → Talkies → Battery saver → No restrictions";
  if (/cph|oppo/.test(ua)) return "Oppo: Settings → Apps → Talkies → Auto-launch ON, Battery → Allow background activity";
  if (/vivo/.test(ua)) return "Vivo: Settings → Battery → Background power consumption → Talkies → Allow; Autostart ON";
  if (/oneplus|in20|kb20|le21/.test(ua)) return "OnePlus: Settings → Battery → Battery optimisation → Talkies → Don't optimise; Auto-launch ON";
  return "Allow Talkies to auto-start and run in the background (Samsung, Realme, Redmi, POCO, Oppo, Vivo, OnePlus: check Battery and Auto-launch)";
}

const push = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.TalkiesPush : null);
const call = () => window.Capacitor?.Plugins?.TalkiesCall;

const BackgroundCallSetup = () => {
  const authUser = useAuthStore((s) => s.authUser);
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState({ notifications: true, fullScreen: true, battery: true, server: true, phone: true });

  const check = async () => {
    const p = push();
    if (!p) return null;
    let next = { notifications: true, fullScreen: true, battery: true, server: true, phone: true };
    try {
      const c = await p.callStatus?.();
      if (c) next = { ...next, notifications: !!c.notifications, fullScreen: c.fullScreen !== false };
    } catch {
      /* ignore */
    }
    try {
      const b = await call()?.batteryStatus?.();
      if (b) next.battery = !!b.unrestricted;
    } catch {
      /* ignore */
    }
    // Can a call actually reach this phone? (server set up for Firebase push + this phone signed up)
    try {
      const { data } = await axiosInstance.get("/push/status");
      next.server = !!data?.fcmServer;
      next.phone = (data?.phones || 0) > 0;
    } catch {
      /* server asleep / old server: don't nag about it */
    }
    setSt(next);
    return next;
  };

  useEffect(() => {
    if (!authUser || !push()) return;
    try {
      if (Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0)) return;
    } catch {
      /* ignore */
    }
    const t = setTimeout(async () => {
      const s = await check();
      if (s && !(s.notifications && s.fullScreen && s.battery && s.server && s.phone)) setOpen(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [authUser]);

  // coming back from a settings screen: re-check
  useEffect(() => {
    if (!open) return;
    const on = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [open]);

  if (!open) return null;

  const close = (done) => {
    try {
      // "I've turned these on" still re-checks after a week; "later" after a day
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + (done ? 7 : 1) * 24 * 3600 * 1000));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const allOk = st.notifications && st.fullScreen && st.battery && st.server && st.phone;

  const Row = ({ icon: Icon, title, hint, ok, onClick }) => (
    <button onClick={onClick} disabled={ok} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-wa-surface text-left disabled:opacity-60">
      <Icon size={22} className={ok ? "text-[#25D366]" : "text-wa-icon"} />
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] text-wa-text">{title}</span>
        <span className="block text-[12px] text-wa-muted">{ok ? "Allowed ✓" : hint}</span>
      </span>
      {!ok && <span className="text-[13px] font-medium text-[#00A884]">Allow</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={() => close(false)}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl px-5 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-1">
          <PhoneIncoming size={22} className="text-[#00A884]" />
          <h3 className="flex-1 text-[17px] font-medium">Get calls when the app is closed</h3>
          <button onClick={() => close(false)} aria-label="Close" className="text-wa-muted">
            <X size={22} />
          </button>
        </div>
        <p className="text-[13px] text-wa-muted mb-4">Your phone may be blocking Talkies in the background. Turn these on once so calls ring on the lock screen.</p>
        <div className="flex flex-col gap-2.5">
          <Row icon={MonitorSmartphone} title="Notifications & lock-screen calls" hint="Needed to show the call screen" ok={st.notifications && st.fullScreen} onClick={() => push()?.openCallSettings?.()} />
          <Row icon={BatteryCharging} title="No battery restrictions" hint="Choose “Allow” / “No restrictions”" ok={st.battery} onClick={() => call()?.requestBatteryUnrestricted?.()} />
          <Row icon={Cloud} title="Server can ring your phone" hint="Not set up on the server yet — the app owner must add FCM_SERVICE_ACCOUNT" ok={st.server} onClick={() => {}} />
          <Row icon={Smartphone} title="This phone is registered" hint="Tap to sign this phone up for call alerts" ok={st.phone} onClick={async () => { await forceRegisterNativePush(authUser._id); check(); }} />
          <Row icon={Rocket} title="Autostart / run in background" hint={brandTip()} ok={false} onClick={() => push()?.openAutostartSettings?.()} />
        </div>
        <button onClick={() => close(true)} className="mt-4 w-full h-11 rounded-full bg-[#25D366] text-wa-bg text-[14.5px] font-medium">
          {allOk ? "Done" : "I've turned these on"}
        </button>
        <button onClick={() => close(false)} className="mt-1 w-full h-10 text-[13px] text-wa-muted">
          Remind me later
        </button>
      </div>
    </div>
  );
};

export default BackgroundCallSetup;
