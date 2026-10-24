import { useState } from "react";
import { X, Phone, Video, Link2, Copy, Share2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";
import { useBackToClose } from "../lib/useBackToClose";

export const callLinkUrl = (code) => `${window.location.origin}/call/${code}`;

// Two sheets in one: "Call link" (anyone with the link can join now) and "Schedule call" (a set time + reminders).
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const CallLinkSheet = ({ schedule = false, onClose, onCreated }) => {
  useBackToClose(true, onClose);
  const users = useChatStore((s) => s.users);
  const [type, setType] = useState("audio");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.size < 9 && n.add(id);
      return n;
    });

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/calls/links", {
        callType: type,
        title,
        ...(schedule ? { scheduledFor: new Date(when).toISOString(), invitees: [...picked] } : {}),
      });
      setMade(data);
      onCreated?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't create the call");
    } finally {
      setBusy(false);
    }
  };

  const url = made ? callLinkUrl(made.code) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: made.title || "Talkies call", text: "Join my call on Talkies", url });
      else await copy();
    } catch {
      /* cancelled */
    }
  };

  const typeBtn = (t, Icon, label) => (
    <button
      type="button"
      onClick={() => setType(t)}
      className={`flex-1 h-11 rounded-full flex items-center justify-center gap-2 text-[14.5px] border ${type === t ? "bg-[#103629] border-transparent text-[#D9FDD3]" : "border-white/15 text-wa-muted"}`}
    >
      <Icon size={18} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-wa-pop text-wa-text rounded-t-[22px] max-h-[88vh] flex flex-col pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-[18px]">{made ? (schedule ? "Call scheduled" : "Your call link") : schedule ? "Schedule call" : "Call link"}</p>
          <button onClick={onClose} aria-label="Close" className="size-9 -mr-2 rounded-full flex items-center justify-center text-wa-muted active:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {made ? (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-3 rounded-xl bg-wa-surface p-3">
              <span className="size-10 rounded-full bg-[#21C063]/20 text-[#21C063] flex items-center justify-center shrink-0">
                <Link2 size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] truncate">{made.title || (made.callType === "video" ? "Video call" : "Voice call")}</p>
                <p className="text-[12.5px] text-wa-muted truncate">{url.replace(/^https?:\/\//, "")}</p>
              </div>
            </div>
            {made.scheduledFor && (
              <p className="text-[13px] text-wa-muted mt-2">
                {new Date(made.scheduledFor).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. You and anyone you invited get a reminder 10 minutes before.
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={copy} className="flex-1 h-11 rounded-full border border-white/15 flex items-center justify-center gap-2 text-[14.5px] active:bg-white/5">
                <Copy size={17} /> Copy link
              </button>
              <button onClick={share} className="flex-1 h-11 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center gap-2 text-[14.5px] font-medium active:scale-[.98]">
                <Share2 size={17} /> Share link
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-2 overflow-y-auto">
            <div className="flex gap-3 mt-1">
              {typeBtn("audio", Phone, "Voice")}
              {typeBtn("video", Video, "Video")}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="Call name (optional)"
              className="mt-3 w-full h-11 rounded-lg bg-wa-bg border border-wa-field px-3 text-[14.5px] placeholder:text-wa-muted focus:outline-none focus:border-[#25D366]"
            />
            {schedule && (
              <>
                <label className="block mt-3 text-[12.5px] text-wa-muted">Date and time</label>
                <input
                  type="datetime-local"
                  value={when}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setWhen(e.target.value)}
                  className="mt-1 w-full h-11 rounded-lg bg-wa-bg border border-wa-field px-3 text-[14.5px] focus:outline-none focus:border-[#25D366]"
                />
                <p className="mt-3 text-[12.5px] text-wa-muted">Invite people ({picked.size}/9) — they get a notification now and a reminder before it starts</p>
                <div className="mt-1 max-h-48 overflow-y-auto -mx-2">
                  {users.map((u) => (
                    <button key={u._id} type="button" onClick={() => toggle(u._id)} className="w-full flex items-center gap-3 px-2 py-1.5 text-left active:bg-white/5 rounded-lg">
                      <Avatar src={u.profilePic} name={u.fullName} size="size-9" textSize="text-sm" />
                      <span className="flex-1 truncate text-[15px]">{u.fullName}</span>
                      <span className={`size-5 rounded-md border-2 flex items-center justify-center ${picked.has(u._id) ? "bg-[#21C063] border-[#21C063] text-[#0B141A]" : "border-wa-muted"}`}>
                        {picked.has(u._id) && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={create}
              disabled={busy || (schedule && !when)}
              className="mt-4 w-full h-12 rounded-full bg-[#21C063] text-[#0B141A] text-[15px] font-medium disabled:opacity-50 active:scale-[.98]"
            >
              {busy ? "Creating…" : schedule ? "Schedule call" : "Create call link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallLinkSheet;
