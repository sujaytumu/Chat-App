import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, MessageCircle, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";

const ago = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const line = (a) => {
  const what = a.kind === "reel" ? "reel" : "post";
  if (a.type === "like") return `liked your ${what}`;
  if (a.type === "reply") return `replied to your comment: ${a.text}`;
  return `commented on your ${what}: ${a.text}`;
};

// Who liked or commented on your reels and posts
const ActivityPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    axiosInstance
      .get("/activity", { timeout: 20000 })
      .then((r) => {
        if (!alive) return;
        setItems(r.data.items || []);
        if (r.data.unread) axiosInstance.put("/activity/read").catch(() => {});
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  const open = (a) => navigate(a.kind === "reel" ? `/reels?r=${a.targetId}` : "/reels?feed=1");

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col">
      <div className="flex items-center gap-3 px-3 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
        <button onClick={() => navigate("/reels")} aria-label="Back"><ChevronLeft size={32} strokeWidth={1.8} /></button>
        <h1 className="text-[20px] font-bold">Activity</h1>
      </div>
      <div className="flex-1 overflow-y-auto pb-[calc(96px+env(safe-area-inset-bottom))]">
        {failed ? (
          <p className="text-center text-white/60 mt-20 px-8">Couldn&apos;t load activity. Check your connection and try again.</p>
        ) : !items ? (
          <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-white/60" /></div>
        ) : !items.length ? (
          <div className="text-center text-white/60 mt-24 px-8">
            <Heart size={40} className="mx-auto mb-3 opacity-60" />
            <p className="font-semibold text-white">No activity yet</p>
            <p className="text-[14px] mt-1">Likes and comments on your reels and posts show up here.</p>
          </div>
        ) : (
          items.map((a) => (
            <button key={a._id} onClick={() => open(a)} className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 ${a.read ? "" : "bg-white/[0.05]"}`}>
              <span className="relative shrink-0">
                <img src={optimizeImage(a.user.profilePic || "/avatar.png", 96)} alt="" className="size-11 rounded-full object-cover" />
                <span className={`absolute -bottom-0.5 -right-0.5 size-5 rounded-full flex items-center justify-center border-2 border-black ${a.type === "like" ? "bg-[#ff3b5c]" : "bg-[#25D366]"}`}>
                  {a.type === "like" ? <Heart size={10} fill="white" strokeWidth={0} /> : <MessageCircle size={10} fill="white" strokeWidth={0} />}
                </span>
              </span>
              <span className="flex-1 min-w-0 text-[14px] leading-snug">
                <b>{a.user.fullName}</b> <span className="text-white/80">{line(a)}</span> <span className="text-white/45">{ago(a.createdAt)}</span>
              </span>
              {a.thumb && <img src={optimizeImage(a.thumb, 120)} alt="" className="size-11 rounded-md object-cover shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityPage;
