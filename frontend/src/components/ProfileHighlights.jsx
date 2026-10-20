import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import HighlightsRow from "./HighlightsRow";
import StatusViewer from "./StatusViewer";
import { HL_GRADIENT } from "../lib/highlightTheme";

// Instagram-style: a person's Highlights shown on their profile (round covers; tap to watch).
const ProfileHighlights = ({ user }) => {
  const authUser = useAuthStore((s) => s.authUser);
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  const isOwn = String(user?._id) === String(authUser?._id);

  useEffect(() => {
    let alive = true;
    if (!user?._id) return undefined;
    axiosInstance
      .get(`/highlights/user/${user._id}`, { params: { t: Date.now() } })
      .then((r) => alive && setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?._id]);

  if (!list.length) return null;
  return (
    <div className="border-b border-white/10 py-3">
      <p className="px-5 pb-1 flex items-center gap-2 text-[13px] font-semibold text-wa-text">
        <span className="size-6 rounded-lg flex items-center justify-center text-white" style={{ background: HL_GRADIENT }}>
          <Bookmark size={13} />
        </span>
        Highlights
      </p>
      <HighlightsRow highlights={list} isOwn={false} onOpen={(h) => setOpen(h)} />
      {open && <StatusViewer user={user} statuses={open.items} isOwn={isOwn} highlight={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default ProfileHighlights;
