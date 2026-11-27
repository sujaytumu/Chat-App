import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, Images } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";

// A post shared in a chat: its first photo, who posted it and the caption. Tap to open the post.
const cache = new Map();

const PostCard = ({ post }) => {
  const navigate = useNavigate();
  const [info, setInfo] = useState(cache.get(post.id) || null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (info) return undefined;
    let alive = true;
    axiosInstance
      .get(`/posts/${post.id}`)
      .then((r) => {
        cache.set(post.id, r.data);
        if (alive) setInfo(r.data);
      })
      .catch(() => alive && setGone(true));
    return () => {
      alive = false;
    };
  }, [post.id, info]);

  if (gone) {
    return (
      <div className="w-[220px] max-w-full mb-1 rounded-lg bg-black/10 px-3 py-4 flex items-center gap-2 text-[13px] opacity-80">
        <ImageIcon size={18} /> This post isn&apos;t available
      </div>
    );
  }
  const first = info?.images?.[0] || info?.image;
  return (
    <button onClick={() => navigate(`/post?p=${post.id}`)} className="block w-[220px] max-w-full mb-1 rounded-2xl overflow-hidden shadow-md bg-black/10 text-left">
      <div className="relative aspect-square bg-black/30">
        {first && <img src={optimizeImage(first, 440)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
        {(info?.images?.length || 0) > 1 && (
          <span className="absolute top-2 right-2 text-white bg-black/45 rounded-full p-1"><Images size={13} /></span>
        )}
        <span className="absolute top-2 left-2 flex items-center gap-1 text-white text-[11px] font-medium bg-black/45 rounded-full px-2 py-0.5"><ImageIcon size={11} /> Post</span>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[13px] font-semibold truncate">{info?.user?.fullName || "Post"}</p>
        {info?.caption && <p className="text-[12.5px] opacity-80 line-clamp-2 break-words">{info.caption}</p>}
      </div>
    </button>
  );
};

export default PostCard;
