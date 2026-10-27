import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Film } from "lucide-react";
import { axiosInstance } from "../lib/axios";

// A reel shared in a chat: its first frame with a play button, who posted it and the caption. Tap to watch.
const cache = new Map();

const ReelCard = ({ reel }) => {
  const navigate = useNavigate();
  const [info, setInfo] = useState(cache.get(reel.id) || null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (info) return;
    let alive = true;
    axiosInstance
      .get(`/reels/${reel.id}`)
      .then((r) => {
        cache.set(reel.id, r.data);
        if (alive) setInfo(r.data);
      })
      .catch(() => alive && setGone(true));
    return () => {
      alive = false;
    };
  }, [reel.id, info]);

  if (gone) {
    return (
      <div className="w-[220px] max-w-full mb-1 rounded-lg bg-black/10 px-3 py-4 flex items-center gap-2 text-[13px] opacity-80">
        <Film size={18} /> This reel isn&apos;t available
      </div>
    );
  }
  return (
    <button onClick={() => navigate(`/reels?r=${reel.id}`)} className="block w-[220px] max-w-full mb-1 rounded-2xl overflow-hidden shadow-md bg-black/10 text-left">
      <div className="relative aspect-[9/14] bg-black">
        {info?.poster && <img src={info.poster} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <span className="size-12 rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/20 text-white flex items-center justify-center"><Play size={24} fill="currentColor" /></span>
        </div>
        <span className="absolute top-2 left-2 flex items-center gap-1 text-white text-[11px] font-medium bg-black/45 rounded-full px-2 py-0.5"><Film size={11} /> Reel</span>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[13px] font-semibold truncate">{info?.user?.fullName || reel.by}</p>
        {info?.caption && <p className="text-[12.5px] opacity-80 line-clamp-2 break-words">{info.caption}</p>}
      </div>
    </button>
  );
};

export default ReelCard;
