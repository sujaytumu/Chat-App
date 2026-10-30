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
  const [open, setOpen] = useState(false); // the "who would you like to see?" box
  const [note, setNote] = useState("");
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
  const wait = info.retryAt ? Math.max(0, info.retryAt - Date.now()) : 0;
  const waitLabel = wait >= 3600000 ? `${Math.ceil(wait / 3600000)} hour${Math.ceil(wait / 3600000) === 1 ? "" : "s"}` : `${Math.max(1, Math.ceil(wait / 60000))} min`;

  const send = async () => {
    if (wait > 0) return;
    setBusy(true);
    try {
      await axiosInstance.post("/access/request", { note: note.trim() });
      setInfo({ ...info, status: "pending" });
      setOpen(false);
      setNote("");
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
    <div className="mx-3 my-2 rounded-2xl bg-wa-surface px-4 py-3">
    <div className="flex items-center gap-3">
      <span className="size-10 rounded-full bg-[#21C063]/15 text-[#21C063] flex items-center justify-center shrink-0">
        {pending ? <Clock size={20} /> : <UserPlus size={20} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-tight">{pending ? "Waiting for approval" : info.status === "declined" ? "Request declined" : info.status === "approved" ? "Want to see more people?" : "See more people?"}</p>
        <p className="text-[12px] text-wa-muted leading-snug mt-0.5">
          {pending ? "The owner will choose who you can see." : info.status === "declined" ? (wait > 0 ? `You can ask again in ${waitLabel}.` : "You can ask again.") : info.status === "approved" ? "Ask the owner to add more people for you." : "Ask the owner to let you see other people on Talkies."}
        </p>
      </div>
      {!pending && !open && (
        <button onClick={() => setOpen(true)} disabled={wait > 0} className="h-9 px-4 rounded-full bg-[#25D366] text-[#0B141A] text-[13.5px] font-semibold disabled:opacity-50 flex items-center shrink-0">
          {info.status === "declined" ? "Ask again" : "Ask"}
        </button>
      )}
    </div>
    {open && !pending && (
      <div className="mt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          rows={2}
          autoFocus
          placeholder="Who would you like to see, and why? (optional)"
          className="w-full rounded-xl bg-white/5 px-3 py-2 text-[13.5px] outline-none placeholder:text-wa-muted resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-wa-muted">{note.length}/200 · the owner decides</span>
          <span className="flex gap-2">
            <button onClick={() => { setOpen(false); setNote(""); }} className="h-9 px-4 rounded-full bg-white/10 text-[13px]">Cancel</button>
            <button onClick={send} disabled={busy} className="h-9 px-4 rounded-full bg-[#25D366] text-[#0B141A] text-[13.5px] font-semibold disabled:opacity-50 flex items-center">
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Send request"}
            </button>
          </span>
        </div>
      </div>
    )}
    </div>
  );
};

export default AccessRequestBanner;
