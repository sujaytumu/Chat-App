import { Smartphone, Volume2, Bluetooth, Headphones, Check } from "lucide-react";
import { useCallStore } from "../store/useCallStore";

// "Audio output" sheet shown from the call screen's Speaker button (Android app):
// Phone (normal earpiece) / Speaker (loud) / Bluetooth headset / wired headphones.
const ICON = { earpiece: Smartphone, speaker: Volume2, bluetooth: Bluetooth, wired: Headphones };
const LABEL = { earpiece: "Phone", speaker: "Speaker", bluetooth: "Bluetooth", wired: "Headphones" };
const HINT = { earpiece: "Normal call volume, hold to your ear", speaker: "Loud, for everyone nearby", bluetooth: "Your Bluetooth headset", wired: "Wired headphones" };

export const routeLabel = (routes, id) => {
  const r = routes.find((x) => x.id === id);
  if (!r) return "Speaker";
  return r.kind === "bluetooth" ? "Bluetooth" : LABEL[r.kind] || r.name;
};

const AudioRoutePicker = () => {
  const open = useCallStore((s) => s.audioPickerOpen);
  const routes = useCallStore((s) => s.audioRoutes);
  const current = useCallStore((s) => s.audioRoute);
  const choose = useCallStore((s) => s.chooseAudioRoute);
  const close = useCallStore((s) => s.closeAudioPicker);
  if (!open || !routes.length) return null;

  return (
    <div className="absolute inset-0 z-[60] bg-black/55 flex items-end justify-center" onClick={close}>
      <div className="w-full max-w-md bg-[#1F2C34] text-white rounded-t-3xl px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1 w-10 rounded-full bg-white/30 mb-3" />
        <h3 className="text-[16px] font-medium px-2 pb-2">Audio output</h3>
        <div className="flex flex-col gap-1">
          {routes.map((r) => {
            const Icon = ICON[r.kind] || Volume2;
            const on = r.id === current;
            return (
              <button key={r.id} onClick={() => choose(r.id)} className={`flex items-center gap-4 px-3 py-3.5 rounded-2xl text-left ${on ? "bg-white/10" : "active:bg-white/5"}`}>
                <Icon size={24} className={on ? "text-[#25D366]" : "text-white/80"} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15.5px] truncate">{r.kind === "bluetooth" && r.name !== "Bluetooth" ? r.name : LABEL[r.kind] || r.name}</span>
                  <span className="block text-[12.5px] text-white/55">{HINT[r.kind]}</span>
                </span>
                {on && <Check size={22} className="text-[#25D366]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AudioRoutePicker;
