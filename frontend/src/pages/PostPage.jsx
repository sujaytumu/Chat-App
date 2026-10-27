import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MainNav from "../components/MainNav";
import { NewPost } from "../components/FeedView";
import { goTab } from "../lib/tabNav";
import { useTabSwipe } from "../lib/useTabSwipe";
import { useReelsModeStore } from "../store/useReelsModeStore";

// The Post tab: a full screen for sharing photos, with the same bottom bar as every other screen.
const PostPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const root = useRef(null);
  useTabSwipe(root);
  const setMode = useReelsModeStore((s) => s.setMode);
  const bumpFeed = useReelsModeStore((s) => s.bumpFeed);
  const toReels = () => goTab(navigate, pathname, "/reels");
  return (
    <div ref={root} className="fixed inset-0 z-[60] bg-black">
      <div className="absolute inset-x-0 top-0 bottom-[calc(72px+env(safe-area-inset-bottom))]">
        <NewPost
          embedded
          onClose={toReels}
          onPosted={() => {
            setMode("feed");
            bumpFeed();
            toReels();
          }}
        />
      </div>
      <MainNav bottomOnly />
    </div>
  );
};

export default PostPage;
