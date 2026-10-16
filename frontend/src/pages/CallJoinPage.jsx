import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Phone, Video, Link2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useGroupCallStore } from "../store/useGroupCallStore";

// Opened from a call link or a scheduled-call reminder: shows the call and lets you join it.
const CallJoinPage = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    axiosInstance
      .get(`/calls/links/${code}`)
      .then((r) => setInfo(r.data))
      .catch((e) => setError(e?.response?.data?.error || "This call link has expired"));
  }, [code]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const join = () => {
    navigate("/", { replace: true });
    setTimeout(
      () =>
        useGroupCallStore.getState().startCall({ _id: `adhoc:link-${info.code}`, name: info.title || "Call link", groupPic: "" }, info.callType),
      200
    );
  };

  const early = info?.scheduledFor && new Date(info.scheduledFor).getTime() - now > 10 * 60 * 1000;
  const Icon = info?.callType === "video" ? Video : Phone;

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-wa-bg text-wa-text px-8 text-center">
      {!info && !error && <Loader2 className="animate-spin text-[#25D366]" size={28} />}
      {error && (
        <>
          <p className="text-[17px]">{error}</p>
          <button onClick={() => navigate("/", { replace: true })} className="mt-6 h-11 px-8 rounded-full border border-white/15 text-[15px]">
            Go to chats
          </button>
        </>
      )}
      {info && (
        <>
          <span className="size-20 rounded-full bg-[#21C063]/20 text-[#21C063] flex items-center justify-center">
            <Link2 size={36} />
          </span>
          <h1 className="mt-5 text-[22px]">{info.title || (info.callType === "video" ? "Video call" : "Voice call")}</h1>
          <p className="mt-1 text-[14.5px] text-wa-muted">
            {info.creatorName ? `Hosted by ${info.creatorName}` : "Talkies call"}
            {info.scheduledFor && ` · ${new Date(info.scheduledFor).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
          </p>
          {info.live && <p className="mt-2 text-[14px] text-[#21C063]">{info.participants} {info.participants === 1 ? "person is" : "people are"} in the call</p>}
          {early && !info.live && <p className="mt-2 text-[13.5px] text-wa-muted">This call hasn&apos;t started yet. You can still open the room early.</p>}
          <button
            onClick={() => {
              toast.dismiss();
              join();
            }}
            className="mt-7 h-12 px-10 rounded-full bg-[#21C063] text-[#0B141A] text-[16px] font-medium flex items-center gap-2 active:scale-[.98]"
          >
            <Icon size={20} /> Join call
          </button>
        </>
      )}
    </div>
  );
};

export default CallJoinPage;
