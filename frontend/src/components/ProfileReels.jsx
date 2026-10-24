import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Clapperboard } from "lucide-react";
import { axiosInstance } from "../lib/axios";

const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n || 0}`);

// Instagram-style "Reels" grid on a profile: tap a tile to watch it in the Reels player.
const ProfileReels = ({ user, onOpen }) => {
  const navigate = useNavigate();
  const [list, setList] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!user?._id) return undefined;
    axiosInstance
      .get(`/reels/user/${user._id}`, { params: { t: Date.now() } })
      .then((r) => alive && setList(r.data?.reels || []))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [user?._id]);

  if (!list?.length) return null;
  return (
    <div className="border-b border-white/10 py-3">
      <p className="px-5 pb-2 flex items-center gap-2 text-[13px] font-semibold text-wa-text">
        <Clapperboard size={16} /> Reels <span className="text-wa-muted font-normal">{list.length}</span>
      </p>
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {list.map((r) => (
          <button
            key={r._id}
            onClick={() => {
              onOpen?.();
              navigate(`/reels?r=${r._id}`);
            }}
            className="relative aspect-[9/14] bg-neutral-900 overflow-hidden active:opacity-80"
          >
            {r.poster ? (
              <img src={r.poster} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            ) : (
              <video src={`${r.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover pointer-events-none" />
            )}
            <span className="absolute bottom-1 left-1.5 flex items-center gap-1 text-white text-[12px] font-semibold drop-shadow">
              <Play size={12} fill="currentColor" /> {count(r.views)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProfileReels;
