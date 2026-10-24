import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import QRCode from "qrcode";
import { X, Check, AlertCircle, Loader2, Copy, Share2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";

export const profileLink = (username) => `${window.location.origin}/?u=${username}`;

// Pick your @username, see its QR code, copy or share your profile link.
const UsernameSheet = ({ onClose }) => {
  useBackToClose(true, onClose);
  const authUser = useAuthStore((s) => s.authUser);
  const current = authUser?.username || "";
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState({ state: "idle" }); // idle | checking | ok | bad
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState("");

  const clean = value.trim().replace(/^@/, "").toLowerCase();

  // availability check while typing (after a short pause)
  useEffect(() => {
    if (!clean || clean === current) {
      setStatus({ state: "idle" });
      return;
    }
    setStatus({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await axiosInstance.get("/auth/username/check", { params: { u: clean } });
        setStatus(res.data.available ? { state: "ok" } : { state: "bad", msg: res.data.error || "Not available" });
      } catch {
        setStatus({ state: "idle" });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [clean, current]);

  useEffect(() => {
    if (!current) {
      setQr("");
      return;
    }
    QRCode.toDataURL(profileLink(current), { margin: 1, width: 260, color: { dark: "#0B141A", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [current]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await axiosInstance.put("/auth/username", { username: clean });
      useAuthStore.setState({ authUser: res.data });
      toast.success(clean ? "Username saved" : "Username removed");
    } catch (e) {
      toast.error(e.response?.data?.message || "Couldn't save your username");
    } finally {
      setSaving(false);
    }
  };

  const link = current ? profileLink(current) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Talkies", text: `Chat with me on Talkies: @${current}`, url: link });
      else await copy();
    } catch {
      /* cancelled */
    }
  };

  const dirty = clean !== current;
  const canSave = dirty && !saving && status.state !== "bad" && status.state !== "checking";

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-semibold">Username and QR code</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>

        <label className="block text-[12.5px] text-wa-muted mb-1.5">Your username</label>
        <div className="flex items-center rounded-2xl bg-wa-field px-4 h-12">
          <span className="text-wa-muted mr-0.5">@</span>
          <input
            value={value.replace(/^@/, "")}
            onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9._@]/g, "").slice(0, 25))}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={25}
            className="flex-1 min-w-0 bg-transparent outline-none text-[15.5px] placeholder:text-wa-muted"
          />
          {status.state === "checking" && <Loader2 size={18} className="animate-spin text-wa-muted" />}
          {status.state === "ok" && <Check size={19} className="text-[#21C063]" />}
          {status.state === "bad" && <AlertCircle size={19} className="text-[#F15C6D]" />}
        </div>
        <p className={`mt-1.5 text-[12px] min-h-[16px] ${status.state === "bad" ? "text-[#F15C6D]" : status.state === "ok" ? "text-[#21C063]" : "text-wa-muted"}`}>
          {status.state === "bad" ? status.msg : status.state === "ok" ? "Available" : "3-24 characters: letters, numbers, . and _"}
        </p>
        <button onClick={save} disabled={!canSave} className="mt-3 w-full h-12 rounded-full bg-[#21C063] text-[#0B141A] font-semibold disabled:opacity-40">
          {saving ? "Saving…" : current ? "Save username" : "Set username"}
        </button>
        {current && !dirty && (
          <button onClick={() => { setValue(""); }} className="mt-2 w-full text-[13px] text-[#F15C6D] py-1">
            Remove username
          </button>
        )}

        {current && (
          <div className="mt-5 flex flex-col items-center">
            <div className="rounded-2xl bg-white p-3">
              {qr ? <img src={qr} alt="Your QR code" className="size-[200px]" /> : <div className="size-[200px] flex items-center justify-center"><Loader2 className="animate-spin text-black/40" /></div>}
            </div>
            <p className="mt-2 text-[15px] font-medium">@{current}</p>
            <p className="text-[12px] text-wa-muted text-center px-4">Anyone who scans this or opens your link can message you.</p>
            <div className="mt-3 flex gap-2 w-full">
              <button onClick={copy} className="flex-1 h-11 rounded-full bg-wa-field text-[13.5px] font-medium flex items-center justify-center gap-2">
                <Copy size={16} /> Copy link
              </button>
              <button onClick={share} className="flex-1 h-11 rounded-full bg-wa-field text-[13.5px] font-medium flex items-center justify-center gap-2">
                <Share2 size={16} /> Share
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default UsernameSheet;
