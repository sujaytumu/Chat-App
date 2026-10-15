import { useEffect, useRef, useState } from "react";
import { Search, Star, ArrowRight, Play, Pause, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { readFileAsBase64 } from "../lib/fileUtils";
import { useBackToClose } from "../lib/useBackToClose";

// WhatsApp-style "Search songs" sheet for status music: search, Suggested / Mood / Genre / Starred,
// tap the picture to hear a preview, star to save, arrow to attach it to the status.
const MOODS = ["Happy", "Chill", "Romantic", "Party", "Sad", "Workout"];
const GENRES = ["Pop", "Bollywood", "Telugu", "Tamil", "Hip-hop", "Rock", "Lo-fi", "Classical"];
const SUGGESTED = ["bollywood top hits", "telugu top hits", "english pop hits"];
const STAR_KEY = "status-starred-songs";

const readStars = () => {
  try {
    return JSON.parse(localStorage.getItem(STAR_KEY) || "[]");
  } catch {
    return [];
  }
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const search = (q) => axiosInstance.get("/status/music/search", { params: { q } }).then((r) => r.data);

const StatusMusicSheet = ({ onClose, onPick, onFiles }) => {
  useBackToClose(true, onClose);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("suggested"); // suggested | mood | genre | starred
  const [sub, setSub] = useState({ mood: MOODS[0], genre: GENRES[0] });
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stars, setStars] = useState(readStars);
  const [playing, setPlaying] = useState(null);
  const [picking, setPicking] = useState(null);
  const audio = useRef(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    []
  );

  useEffect(() => {
    const my = ++seq.current;
    setError("");
    if (!query.trim() && chip === "starred") {
      setSongs(stars);
      setLoading(false);
      return;
    }
    setLoading(true);
    const run = async () => {
      try {
        let list;
        if (query.trim()) list = await search(query.trim());
        else if (chip === "suggested") {
          const lists = await Promise.all(SUGGESTED.map((q) => search(q).catch(() => [])));
          const seen = new Set();
          list = [];
          for (let i = 0; i < 12; i++) {
            for (const l of lists) {
              const s = l[i];
              if (s && !seen.has(s.id)) {
                seen.add(s.id);
                list.push(s);
              }
            }
          }
        } else list = await search(`${sub[chip]} songs`);
        if (my === seq.current) setSongs(list);
      } catch {
        if (my === seq.current) {
          setSongs([]);
          setError("Song search is unavailable right now. Check your connection and try again.");
        }
      } finally {
        if (my === seq.current) setLoading(false);
      }
    };
    const t = setTimeout(run, query.trim() ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, chip, sub, chip === "starred" ? stars : null]);

  const togglePlay = (s) => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.onended = () => setPlaying(null);
    }
    const a = audio.current;
    if (playing === s.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = s.preview;
    a.play().then(() => setPlaying(s.id)).catch(() => toast.error("Couldn't play that preview"));
  };

  const toggleStar = (s) => {
    const next = stars.some((x) => x.id === s.id) ? stars.filter((x) => x.id !== s.id) : [s, ...stars];
    setStars(next);
    try {
      localStorage.setItem(STAR_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const choose = async (s) => {
    if (picking) return;
    audio.current?.pause();
    setPlaying(null);
    setPicking(s.id);
    try {
      const r = await axiosInstance.get("/status/music/audio", { params: { url: s.preview }, responseType: "blob", timeout: 60000 });
      const data = await readFileAsBase64(r.data);
      onPick({ data, name: s.title, size: r.data.size, mime: r.data.type || "audio/mp4" });
    } catch (e) {
      toast.error(e.response?.status === 413 ? "That song is too large" : "Couldn't add that song — try another");
    } finally {
      setPicking(null);
    }
  };

  const chipCls = (on) =>
    `shrink-0 h-9 px-4 rounded-full border text-[13.5px] ${on ? "bg-[#12352A] border-[#1F6B4C] text-[#5CE6A1]" : "border-[#3A3F43] text-[#C5CDD2]"}`;
  const subs = chip === "mood" ? MOODS : chip === "genre" ? GENRES : null;

  return (
    <div className="absolute inset-0 z-[60] bg-[#0B0D0F]">
      <div className="h-full flex flex-col rounded-t-[24px] bg-[#0F1316] overflow-hidden">
        <div className="relative flex justify-center pt-3 shrink-0">
          <button onClick={onClose} aria-label="Close" className="px-8 py-1">
            <span className="block w-9 h-1 rounded-full bg-[#4A5258]" />
          </button>
          <button onClick={onClose} aria-label="Close" className="absolute right-2 top-1 size-9 rounded-full flex items-center justify-center text-[#8E9AA2] active:bg-white/10">
            <X size={20} />
          </button>
        </div>
        <div className="mx-3.5 mt-2 flex items-center gap-3 h-[46px] rounded-full bg-[#171C20] px-4 shrink-0">
          <Search size={20} className="text-white shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs"
            maxLength={80}
            className="flex-1 min-w-0 bg-transparent text-white placeholder:text-[#8E9AA2] text-[15px] focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear" className="text-[#8E9AA2]">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex gap-2.5 px-3.5 pt-4 overflow-x-auto no-scrollbar shrink-0">
          {[["suggested", "Suggested"], ["mood", "Mood"], ["genre", "Genre"], ["starred", "Starred"]].map(([id, label]) => (
            <button key={id} onClick={() => { setChip(id); setQuery(""); }} className={chipCls(chip === id && !query)}>
              {label}
            </button>
          ))}
          <button onClick={onFiles} className={chipCls(false)}>
            From files
          </button>
        </div>
        {subs && !query && (
          <div className="flex gap-2 px-3.5 pt-3 overflow-x-auto no-scrollbar shrink-0">
            {subs.map((m) => (
              <button
                key={m}
                onClick={() => setSub((s) => ({ ...s, [chip]: m }))}
                className={`shrink-0 h-8 px-3.5 rounded-full text-[12.5px] ${sub[chip] === m ? "bg-[#2A3035] text-white" : "bg-[#171C20] text-[#9AA6AE]"}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {loading && (
            <p className="flex items-center justify-center gap-2 text-[#8E9AA2] text-[13px] pt-10">
              <Loader2 size={16} className="animate-spin" /> Finding songs…
            </p>
          )}
          {!loading && error && <p className="text-center text-[#8E9AA2] text-[13px] px-8 pt-10">{error}</p>}
          {!loading && !error && songs.length === 0 && (
            <p className="text-center text-[#8E9AA2] text-[13px] px-8 pt-10">{chip === "starred" && !query ? "Star a song to find it here." : "No songs found."}</p>
          )}
          {!loading &&
            songs.map((s) => {
              const starred = stars.some((x) => x.id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 px-3.5 py-2">
                  <button onClick={() => togglePlay(s)} aria-label={playing === s.id ? "Pause preview" : "Play preview"} className="relative size-[52px] rounded-lg overflow-hidden shrink-0 bg-[#1F252A]">
                    {s.art && <img src={s.art} alt="" className="size-full object-cover" loading="lazy" />}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                      {playing === s.id ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                    </span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] text-[#E9EDEF] truncate">{s.title}</p>
                    <p className="text-[12.5px] text-[#8E9AA2] truncate">
                      {s.artist} · {fmt(s.seconds)}
                    </p>
                  </div>
                  <button onClick={() => toggleStar(s)} aria-label={starred ? "Remove star" : "Star"} className={`size-9 flex items-center justify-center ${starred ? "text-[#FFD60A]" : "text-white"}`}>
                    <Star size={24} fill={starred ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => choose(s)} disabled={!!picking} aria-label="Use this song" className="size-10 rounded-full bg-[#232A2F] text-white flex items-center justify-center shrink-0 active:bg-[#2d353b] disabled:opacity-60">
                    {picking === s.id ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={20} />}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default StatusMusicSheet;
