// The song attached to a status, WhatsApp-style:
//  - SongBars: three little "now playing" bars (they freeze while the song is paused)
//  - SongSheet: tap the song line to see what is playing and mute / unmute it

import { X, Music, Volume2, VolumeX } from "lucide-react";

export const SongBars = ({ playing = true, className = "" }) => (
  <span className={`eq-bars ${playing ? "" : "paused"} ${className}`} aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);

// "Title - Artist" is how the music search names songs; split it for a nicer two-line view.
const splitName = (name = "") => {
  const i = name.indexOf(" - ");
  return i > 0 ? { title: name.slice(0, i), artist: name.slice(i + 3) } : { title: name || "Song", artist: "" };
};

export const SongSheet = ({ song, playing, muted, onToggleMute, onClose }) => {
  const { title, artist } = splitName(song?.name);
  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-end" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-md mx-auto bg-wa-panel rounded-t-3xl pb-[calc(12px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <h3 className="flex-1 text-[15.5px] text-wa-text">Music</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="size-16 shrink-0 rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white">
            {playing && !muted ? <SongBars className="!h-6" /> : <Music size={28} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] text-wa-text truncate">{title}</p>
            {artist && <p className="text-[13px] text-wa-muted truncate">{artist}</p>}
            <p className="text-[11.5px] text-wa-muted mt-0.5">{muted ? "Muted" : playing ? "Playing now" : "Paused"}</p>
          </div>
        </div>
        <button
          onClick={onToggleMute}
          className="mx-5 mt-1 mb-1 w-[calc(100%-40px)] h-12 rounded-full bg-white/10 text-wa-text text-[14.5px] flex items-center justify-center gap-2 active:bg-white/15"
        >
          {muted ? <Volume2 size={19} /> : <VolumeX size={19} />} {muted ? "Unmute song" : "Mute song"}
        </button>
      </div>
    </div>
  );
};
