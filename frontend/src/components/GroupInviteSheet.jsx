import { useEffect, useState } from "react";
import { Link2, Copy, Share2, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";

export const inviteUrl = (code) => `${window.location.origin}/?join=${code}`;

// Admins: the group's invite link — copy it, share it, or reset it.
const GroupInviteSheet = ({ group, onClose }) => {
  useBackToClose(true, onClose);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (reset = false) => {
    setBusy(true);
    try {
      const r = await axiosInstance.post(`/groups/${group._id}/invite`, { reset });
      setCode(r.data.code);
      if (reset) toast("Invite link reset — the old link no longer works");
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't get the invite link");
      onClose();
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = code ? inviteUrl(code) : "";
  const copy = () => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: group.name, text: `Join "${group.name}" on Talkies`, url });
      else copy();
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/20" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <Link2 size={20} className="text-[#00A884]" />
          <h3 className="flex-1 text-[16px] font-medium">Invite to group via link</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <p className="px-5 text-[12.5px] text-wa-muted">Anyone with this link can join the group. Share it only with people you trust.</p>
        <p className="mx-5 mt-3 px-3 py-3 rounded-xl bg-wa-field text-[13px] break-all select-all min-h-[46px]">{code ? url : "…"}</p>
        <div className="flex gap-3 px-5 mt-4">
          <button onClick={share} disabled={!code} className="flex-1 h-11 rounded-full bg-[#00A884] text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50">
            <Share2 size={18} /> Share link
          </button>
          <button onClick={copy} disabled={!code} className="flex-1 h-11 rounded-full border border-white/15 text-[14px] flex items-center justify-center gap-2 disabled:opacity-50">
            <Copy size={18} /> Copy link
          </button>
        </div>
        <button onClick={() => load(true)} disabled={busy} className="mx-auto mt-4 flex items-center gap-2 text-[13px] text-[#F15C6D] disabled:opacity-50">
          <RefreshCw size={15} /> Reset link
        </button>
      </div>
    </div>
  );
};

export default GroupInviteSheet;
