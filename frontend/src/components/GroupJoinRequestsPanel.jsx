import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import { Switch } from "./SettingsShell";
import Avatar from "./Avatar";

// Admins: ask people who use the invite link to wait for approval, and answer the waiting requests.
const GroupJoinRequestsPanel = ({ group, onClose, onCount }) => {
  useBackToClose(true, onClose);
  const [on, setOn] = useState(group.approveJoins === true);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");

  const load = () =>
    axiosInstance
      .get(`/groups/${group._id}/join-requests`)
      .then((r) => {
        setList(r.data);
        onCount?.(r.data.length);
      })
      .catch(() => setList((l) => l || []));

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // new requests show up while this screen is open
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group._id]);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    try {
      await axiosInstance.put(`/groups/${group._id}/approve-joins`, { on: next });
      useChatStore.setState((st) => ({ groups: st.groups.map((g) => (g._id === group._id ? { ...g, approveJoins: next } : g)) }));
    } catch (e) {
      setOn(!next);
      toast.error(e.response?.data?.error || "Couldn't change this. Check your connection.");
    }
  };

  const answer = async (u, approve) => {
    setBusy(u._id);
    try {
      await axiosInstance.post(`/groups/${group._id}/join-requests/${u._id}`, { approve });
      setList((l) => {
        const next = (l || []).filter((x) => x._id !== u._id);
        onCount?.(next.length);
        return next;
      });
      if (approve) toast.success(`${u.fullName} joined the group`);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't do that");
      load();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[96] bg-wa-bg text-wa-text flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-wa-panel">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[16px]">Approve new members</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button type="button" role="switch" aria-checked={on} onClick={toggle} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5">
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px]">Approve new members</span>
            <span className="block text-[12.5px] text-wa-muted mt-0.5">People who use the invite link have to wait for an admin to let them in.</span>
          </span>
          <Switch checked={on} />
        </button>
        <p className="px-5 pt-4 pb-2 text-[12.5px] text-[#00A884]">Waiting to join{list ? ` (${list.length})` : ""}</p>
        {list === null && <Loader2 className="mx-auto mt-6 animate-spin text-[#25D366]" size={24} />}
        {list?.length === 0 && <p className="px-5 py-4 text-[13px] text-wa-muted">No one is waiting.</p>}
        {list?.map((u) => (
          <div key={u._id} className="flex items-center gap-3 px-5 py-2.5">
            <Avatar src={u.profilePic} name={u.fullName} size="size-11" textSize="text-base" />
            <span className="flex-1 min-w-0 truncate text-[15px]">{u.fullName}</span>
            <button disabled={busy === u._id} onClick={() => answer(u, false)} aria-label={`Decline ${u.fullName}`} className="size-10 rounded-full border border-white/15 flex items-center justify-center text-[#F15C6D] disabled:opacity-50">
              <X size={18} />
            </button>
            <button disabled={busy === u._id} onClick={() => answer(u, true)} aria-label={`Approve ${u.fullName}`} className="size-10 rounded-full bg-[#00A884] flex items-center justify-center text-white disabled:opacity-50">
              <Check size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GroupJoinRequestsPanel;
