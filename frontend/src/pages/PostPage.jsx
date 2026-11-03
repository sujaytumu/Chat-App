import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import MainNav from "../components/MainNav";
import FeedView, { NewPost } from "../components/FeedView";
import { useTabSwipe } from "../lib/useTabSwipe";

// The Post tab: every photo post lives here (and only here, never in Reels). The feed comes first; the plus
// buttons (floating, and at the end of the feed) open the composer, and sharing returns to the feed with the
// new post at the top.
const PostPage = () => {
  const root = useRef(null);
  useTabSwipe(root);
  const [composing, setComposing] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const [params] = useSearchParams();
  const focusId = params.get("p") || undefined; // opened from a shared post link

  return (
    <div ref={root} className="fixed inset-0 z-[60] bg-black">
      <div className="absolute inset-x-0 top-0 bottom-[calc(72px+env(safe-area-inset-bottom))]">
        {composing ? (
          <NewPost
            embedded
            onClose={() => setComposing(false)}
            onPosted={() => {
              setComposing(false);
              setFeedKey((k) => k + 1); // reload the feed: the new post is first
              toast.success("Posted");
            }}
          />
        ) : (
          <>
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black via-black/85 to-transparent">
              <h1 className="text-white text-[24px] font-bold drop-shadow">Posts</h1>
              <button
                onClick={() => setComposing(true)}
                aria-label="New post"
                className="size-11 rounded-full bg-white/12 border border-white/20 text-white flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: "rgba(255,255,255,.12)" }}
              >
                <Plus size={26} strokeWidth={2.2} />
              </button>
            </div>
            <FeedView onCreate={() => setComposing(true)} refreshKey={feedKey} focusId={focusId} topPad="calc(60px + env(safe-area-inset-top))" />
          </>
        )}
      </div>
      <MainNav bottomOnly />
    </div>
  );
};

export default PostPage;
