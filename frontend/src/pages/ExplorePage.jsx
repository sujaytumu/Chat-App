import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Eye, X, House, CircleDashed, Phone, Film } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { optimizeImage } from "../lib/cdn";
import { useAuthStore } from "../store/useAuthStore";

const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

// Explore: a search bar and a grid of up to 16 reels (tap one to watch it in the Reels player).
const ExplorePage = () => {
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
    <div className="fixed inset-0 bg-black text-white flex flex-col">
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
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(70px+env(safe-area-inset-bottom))]">
        {loading && !list.length ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
        ) : !list.length ? (
          <p className="text-center text-white/55 py-16 text-[15px]">{q.trim().length >= 2 ? "No reels found" : "No reels yet"}</p>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {list.map((r) => (
              <button key={r._id} onClick={() => navigate(`/reels?r=${r._id}`)} className="relative aspect-[9/14] bg-neutral-900 overflow-hidden active:opacity-80">
                {r.poster ? (
                  <img src={r.poster} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <video src={`${r.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover pointer-events-none" />
                )}
                <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[15px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,.8)]">
                  <Eye size={17} /> {count(r.views)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="absolute bottom-0 inset-x-0 h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-black flex items-center justify-around z-30">
        <button onClick={() => navigate("/")} className="flex-1 flex justify-center" aria-label="Chats"><House size={28} strokeWidth={1.8} /></button>
        <button onClick={() => navigate("/status")} className="flex-1 flex justify-center" aria-label="Updates"><CircleDashed size={28} strokeWidth={1.8} /></button>
        <button onClick={() => navigate("/reels")} className="flex-1 flex justify-center" aria-label="Reels"><Film size={26} strokeWidth={1.8} /></button>
        <span className="flex-1 flex justify-center"><span className="px-5 py-2 rounded-full bg-white/15"><Search size={26} strokeWidth={2} /></span></span>
        <button onClick={() => navigate("/calls")} className="flex-1 flex justify-center" aria-label="Calls"><Phone size={26} strokeWidth={1.8} /></button>
        <button onClick={() => navigate("/profile")} className="flex-1 flex justify-center" aria-label="You">
          <img src={optimizeImage(me?.profilePic || "/avatar.png", 80)} alt="" className="size-8 rounded-full object-cover" />
        </button>
      </nav>
    </div>
  );
};

export default ExplorePage;
