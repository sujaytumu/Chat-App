import { useEffect, useState } from "react";
import { UserPlus, Loader2, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";

// New people only see the owner at first. This card lets them ask the owner for more people; the owner approves
// (and picks whom they may see) or declines.
const AccessRequestBanner = () => {
  const socket = useAuthStore((s) => s.socket);
  const [info, setInfo] = useState(null); // { owner, status }
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false); // second tap confirms asking again after a "no"
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const load = () => axiosInstance.get("/access/mine").then((r) => setInfo(r.data)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!socket) return undefined;
    const on = () => load();
    socket.on("accessDecision", on);
    return () => socket.off("accessDecision", on);
  }, [socket]);

  if (!info || info.owner) return null;
  if (info.status === "approved") return null; // they can already see their people

  const wait = info.retryAt ? Math.max(0, info.retryAt - Date.now()) : 0;
  const waitLabel = wait >= 3600000 ? `${Math.ceil(wait / 3600000)} hour${Math.ceil(wait / 3600000) === 1 ? "" : "s"}` : `${Math.max(1, Math.ceil(wait / 60000))} min`;

  const ask = async () => {
    if (wait > 0) return;
    if (info.status === "declined" && !sure) {
      setSure(true);
      setTimeout(() => setSure(false), 6000);
      return;
    }
    setSure(false);
    setBusy(true);
    try {
      await axiosInstance.post("/access/request", {});
      setInfo({ ...info, status: "pending" });
      toast.success("Request sent to the owner");
    } catch (e) {
      if (e.response?.data?.retryAt) setInfo((i) => ({ ...i, retryAt: e.response.data.retryAt }));
      toast.error(e.response?.data?.error || "Couldn't send the request");
    } finally {
      setBusy(false);
    }
  };

  const pending = info.status === "pending";
  return (
    <div className="mx-3 my-2 rounded-2xl bg-wa-surface px-4 py-3 flex items-center gap-3">
      <span className="size-10 rounded-full bg-[#21C063]/15 text-[#21C063] flex items-center justify-center shrink-0">
        {pending ? <Clock size={20} /> : <UserPlus size={20} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-tight">{pending ? "Waiting for approval" : info.status === "declined" ? "Request declined" : "See more people?"}</p>
        <p className="text-[12px] text-wa-muted leading-snug mt-0.5">
          {pending ? "The owner will choose who you can see." : info.status === "declined" ? (wait > 0 ? `You can ask again in ${waitLabel}.` : sure ? "Tap again to send your request again." : "You can ask again.") : "Ask the owner to let you see other people on Talkies."}
        </p>
      </div>
      {!pending && (
        <button onClick={ask} disabled={busy || wait > 0} className="h-9 px-4 rounded-full bg-[#25D366] text-[#0B141A] text-[13.5px] font-semibold disabled:opacity-50 flex items-center shrink-0">
          {busy ? <Loader2 size={16} className="animate-spin" /> : info.status === "declined" ? (sure ? "Send again" : "Ask again") : "Ask"}
        </button>
      )}
    </div>
  );
};

export default AccessRequestBanner;
