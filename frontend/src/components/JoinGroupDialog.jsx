import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";

// Opened by an invite link (…/?join=CODE): shows the group and lets you join it.
const JoinGroupDialog = ({ code, onDone }) => {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    axiosInstance
      .get(`/groups/join/${code}`)
      .then((r) => setInfo(r.data))
      .catch((e) => setError(e.response?.data?.error || "This invite link is no longer valid"));
  }, [code]);

  const open = (group) => {
    const st = useChatStore.getState();
    if (!st.groups.some((g) => g._id === group._id)) useChatStore.setState({ groups: [group, ...st.groups] });
    st.setSelectedChat({ type: "group", data: group });
  };

  const join = async () => {
    setJoining(true);
    try {
      const r = await axiosInstance.post(`/groups/join/${code}`);
      toast.success(info?.alreadyMember ? "Opening group" : `You joined ${r.data.name}`);
      open(r.data);
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't join the group");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-black/60 flex items-center justify-center p-6" onClick={onDone}>
      <div className="w-full max-w-xs rounded-3xl bg-wa-pop text-wa-text p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!info && !error && <Loader2 className="mx-auto animate-spin text-[#25D366]" size={28} />}
        {error && (
          <>
            <p className="text-[15px] mb-4">{error}</p>
            <button onClick={onDone} className="h-10 px-6 rounded-full text-[#25D366]">OK</button>
          </>
        )}
        {info && (
          <>
            <div className="flex justify-center">
              <Avatar src={info.groupPic} name={info.name} isGroup size="size-24" textSize="text-4xl" />
            </div>
            <h3 className="text-[18px] font-medium mt-3 break-words">{info.name}</h3>
            <p className="text-[12.5px] text-wa-muted mt-0.5">Group · {info.memberCount} members</p>
            <div className="flex gap-3 mt-5">
              <button onClick={onDone} className="flex-1 h-11 rounded-full border border-white/15 text-[14px]">Cancel</button>
              <button onClick={join} disabled={joining} className="flex-1 h-11 rounded-full bg-[#00A884] text-white text-[14px] disabled:opacity-60">
                {info.alreadyMember ? "Open" : joining ? "Joining…" : "Join group"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JoinGroupDialog;
