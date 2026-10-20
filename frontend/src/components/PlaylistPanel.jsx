import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, Play, Pause, Trash2, Loader2, Music2, SkipForward } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";

// A playlist everyone in the chat builds together. Tap a song to hear its preview; "Play all" goes through them.
const PlaylistPanel = ({ chat, onClose }) => {
  useBackToClose(true, onClose);
  const chatType = chat.type;
  const chatId = chat.data._id;
  const base = `/playlists/${chatType}/${chatId}`;
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [playing, setPlaying] = useState(null); // song id
  const audio = useRef(null);
  const queue = useRef({ list: [], all: false });

  const load = useCallback(() => axiosInstance.get(base).then((r) => setSongs(Array.isArray(r.data) ? r.data : [])).catch(() => {}).finally(() => setLoading(false)), [base]);
  useEffect(() => {
    load();
    const socket = useAuthStore.getState().socket;
    const on = (p) => p?.chatType === chatType && String(p.chatId) === String(chatId) && load();
    socket?.on("playlistUpdated", on);
    return () => socket?.off("playlistUpdated", on);
  }, [load, chatType, chatId]);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    []
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return undefined;
    }
    setSearching(true);
    const t = setTimeout(() => {
      axiosInstance
        .get("/status/music/search", { params: { q: query.trim() } })
        .then((r) => setResults(r.data || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const play = (song, all = false) => {
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    if (playing === song.id && !all) {
      a.pause();
      setPlaying(null);
      return;
    }
    queue.current = { list: songs, all };
    a.onended = () => {
      const { list, all: auto } = queue.current;
      const i = list.findIndex((s) => s.id === song.id);
      const next = auto ? list[i + 1] : null;
      if (next) play(next, true);
      else setPlaying(null);
    };
    a.src = song.preview;
    a.play().then(() => setPlaying(song.id)).catch(() => toast.error("Couldn't play that song"));
  };

  const add = async (s) => {
    try {
      const r = await axiosInstance.post(base, { id: s.id, title: s.title, artist: s.artist, art: s.art, preview: s.preview });
      setSongs(r.data);
      toast.success("Added to the playlist");
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't add that song");
    }
  };
  const remove = async (s) => {
    try {
      const r = await axiosInstance.delete(`${base}/${s.id}`);
      setSongs(r.data);
      if (playing === s.id) {
        audio.current?.pause();
        setPlaying(null);
      }
    } catch {
      toast.error("Couldn't remove that song");
    }
  };

  const art = (s) => (s.art ? <img src={s.art} alt="" className="size-full object-cover" loading="lazy" /> : <Music2 size={20} className="m-auto text-wa-muted" />);
  const shown = results ?? null;

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md h-[85dvh] lg:h-[80vh] flex flex-col bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <h3 className="flex-1 text-[17px] font-semibold flex items-center gap-2">
            <Music2 size={20} className="text-[#21C063]" /> Shared playlist
          </h3>
          {songs.length > 0 && (
            <button onClick={() => play(songs[0], true)} className="h-9 px-4 rounded-full bg-[#21C063] text-[#0B141A] text-[13px] font-semibold flex items-center gap-1.5">
              <SkipForward size={15} /> Play all
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>
        <div className="mx-4 mb-2 flex items-center gap-3 h-11 rounded-full bg-wa-field px-4">
          <Search size={18} className="text-wa-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a song to add" className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-wa-muted" />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear" className="text-wa-muted">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          {shown ? (
            <>
              {searching && <Loader2 className="animate-spin mx-auto my-6 text-wa-muted" size={20} />}
              {!searching && shown.length === 0 && <p className="text-center text-[13px] text-wa-muted pt-8">No songs found.</p>}
              {shown.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <button onClick={() => play(s)} className="relative size-12 rounded-lg overflow-hidden shrink-0 bg-wa-field flex" aria-label="Preview">
                    {art(s)}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">{playing === s.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] truncate">{s.title}</p>
                    <p className="text-[12px] text-wa-muted truncate">{s.artist}</p>
                  </div>
                  <button onClick={() => add(s)} disabled={songs.some((x) => x.id === s.id)} className="size-9 rounded-full bg-wa-field flex items-center justify-center disabled:opacity-40" aria-label="Add to playlist">
                    <Plus size={18} />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              {loading && <Loader2 className="animate-spin mx-auto my-6 text-wa-muted" size={20} />}
              {!loading && songs.length === 0 && <p className="text-center text-[13px] text-wa-muted px-8 pt-10">No songs yet. Search above and add the first one — everyone in this chat can add to it.</p>}
              {songs.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <button onClick={() => play(s)} className="relative size-12 rounded-lg overflow-hidden shrink-0 bg-wa-field flex" aria-label={playing === s.id ? "Pause" : "Play"}>
                    {art(s)}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">{playing === s.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] truncate">{s.title}</p>
                    <p className="text-[12px] text-wa-muted truncate">
                      {s.artist}
                      {s.addedByName ? ` · added by ${s.addedByName.split(" ")[0]}` : ""}
                    </p>
                  </div>
                  <button onClick={() => remove(s)} className="size-9 flex items-center justify-center text-wa-muted hover:text-[#F15C6D]" aria-label="Remove">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PlaylistPanel;
