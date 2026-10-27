import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Eye, X, Film } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import MainNav from "../components/MainNav";
import { useTabSwipe } from "../lib/useTabSwipe";
import { useAuthStore } from "../store/useAuthStore";

const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

// Explore: a search bar and a grid of up to 16 reels (tap one to watch it in the Reels player).
const ExplorePage = () => {
  const swipeRoot = useRef(null);
  useTabSwipe(swipeRoot); // swipe left/right = next / previous tab
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.authUser);
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const term = q.trim();
    setLoading(true);
    const t = setTimeout(
      async () => {
        try {
          const { data } = term.length >= 2
            ? await axiosInstance.get("/reels/search", { params: { q: term }, timeout: 15000 })
            : await axiosInstance.get("/reels/explore", { timeout: 15000 });
          if (my === seq.current) setList((data.reels || []).slice(0, 16));
        } catch {
          if (my === seq.current) setList([]);
        } finally {
          if (my === seq.current) setLoading(false);
        }
      },
      term.length >= 2 ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div ref={swipeRoot} className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2.5 h-12 rounded-full bg-white/10 px-4">
          <Search size={20} className="text-white/70 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reels, #tags or people"
            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-white/55"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear" className="text-white/70"><X size={18} /></button>
          )}
        </div>
        {!q && (
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            {["#motivation", "#gym", "#study", "#focus", "#fitness"].map((t) => (
              <button key={t} onClick={() => setQ(t)} className="shrink-0 px-3.5 py-1.5 rounded-full bg-white/10 text-[13.5px] active:bg-white/20">{t}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(90px+env(safe-area-inset-bottom))]">
        {loading && !list.length ? (
          <div className="grid grid-cols-3 gap-1 px-1">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[9/14] rounded-md bg-white/10 animate-pulse" />)}
          </div>
        ) : !list.length ? (
          <p className="text-center text-white/55 py-16 text-[15px]">{q.trim().length >= 2 ? "No reels found" : "No reels yet"}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1 px-1">
            {list.map((r) => (
              <button key={r._id} onClick={() => navigate(`/reels?r=${r._id}`)} className="relative aspect-[9/14] bg-neutral-900 overflow-hidden rounded-md active:scale-[0.97] transition-transform">
                {r.poster ? (
                  <img src={r.poster} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <video src={`${r.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover pointer-events-none" />
                )}
                <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                <Film size={16} className="absolute top-2 right-2 text-white drop-shadow" />
                <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[14px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,.8)]">
                  <Eye size={17} /> {count(r.views)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <MainNav bottomOnly />
    </div>
  );
};

export default ExplorePage;
