import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video, Clock, Trophy } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "./Avatar";
import { WaBack } from "./icons/WaIcons";

const RANGES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [0, "All time"],
];

const dur = (sec = 0) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};
const mb = (b = 0) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.round(b / 1048576)} MB`);
const hour12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

const Stat = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-2xl bg-wa-panel p-4">
    <Icon size={20} style={{ color }} />
    <p className="mt-2 text-[24px] leading-none font-semibold">{value}</p>
    <p className="mt-1 text-[13px] text-wa-muted">{label}</p>
  </div>
);

// Full-screen call statistics: totals, time on calls, missed, and who you talk to most.
const CallStatsSheet = ({ onClose }) => {
  useBackToClose(true, onClose);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    axiosInstance
      .get("/calls/stats", { params: days ? { days } : {} })
      .then((r) => live && setData(r.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [days]);

  const t = data?.totals;
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[150] bg-wa-bg text-wa-text flex flex-col">
      <div className="flex items-center gap-2 px-2 h-14 shrink-0 border-b border-white/10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <button onClick={onClose} aria-label="Back" className="size-11 flex items-center justify-center"><WaBack size={24} /></button>
        <h2 className="text-[20px]">Call stats</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 shrink-0">
        {RANGES.map(([d, label]) => (
          <button
            key={label}
            onClick={() => setDays(d)}
            className={`h-9 px-4 rounded-full text-[14px] shrink-0 ${days === d ? "bg-[#21C063] text-[#0B141A] font-semibold" : "bg-wa-panel text-wa-text"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {failed && <p className="py-10 text-center text-wa-muted">Couldn't load your call stats.</p>}
        {!data && !failed && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-wa-muted" /></div>}
        {t && t.calls === 0 && <p className="py-10 text-center text-wa-muted">No calls in this period.</p>}
        {t && t.calls > 0 && (
          <>
            <div className="rounded-2xl bg-wa-panel p-5 mb-3">
              <p className="text-[13px] text-wa-muted">Time on calls</p>
              <p className="text-[34px] leading-tight font-semibold">{dur(t.totalSeconds)}</p>
              <p className="text-[13px] text-wa-muted mt-1">
                {t.calls} call{t.calls === 1 ? "" : "s"} · avg {dur(t.averageSeconds)} · longest {dur(t.longestSeconds)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={PhoneOutgoing} label="Outgoing" value={t.outgoing} color="#25D366" />
              <Stat icon={PhoneIncoming} label="Incoming" value={t.incoming} color="#53BDEB" />
              <Stat icon={PhoneMissed} label="Missed incoming" value={t.missedIncoming} color="#F15C6D" />
              <Stat icon={Video} label="Video calls" value={t.video} color="#B794F6" />
            </div>
            <p className="mt-3 text-[13px] text-wa-muted px-1">
              {t.declined} declined · {t.noAnswerOutgoing} not answered
              {data.busiestHour != null ? ` · busiest around ${hour12(data.busiestHour)}` : ""}
              {t.dataBytes ? ` · ${mb(t.dataBytes)} used` : ""}
            </p>

            {data.topPeople?.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-wa-muted flex items-center gap-2"><Trophy size={15} /> Talk the most</h3>
                <div className="rounded-2xl bg-wa-panel overflow-hidden">
                  {data.topPeople.map((p, i) => (
                    <div key={p.user._id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-5 text-[14px] text-wa-muted">{i + 1}</span>
                      <Avatar src={p.user.profilePic} name={p.user.fullName} size="size-11" textSize="text-lg" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[16px]">{p.user.fullName}</p>
                        <p className="text-[12.5px] text-wa-muted">{p.calls} call{p.calls === 1 ? "" : "s"}{p.missed ? ` · ${p.missed} missed` : ""}</p>
                      </div>
                      <span className="flex items-center gap-1 text-[14px] text-wa-muted"><Clock size={14} />{dur(p.totalSeconds)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default CallStatsSheet;
