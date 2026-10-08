import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

// Only one voice note plays at a time (like WhatsApp): starting one pauses the other.
let currentlyPlaying = null;

const BARS = 40;
const SPEEDS = [1, 1.5, 2];

const fmt = (secs) => {
  const s = Math.max(0, Math.round(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Stable pseudo-waveform for notes recorded before waveforms were stored
const fallbackBars = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h ^= h >>> 13;
    return 25 + (Math.abs(h) % 70);
  });
};

const VoiceMessagePlayer = ({ file, onError }) => {
  const audioRef = useRef(null);
  const barsRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(file.duration || 0);
  const [rate, setRate] = useState(1);

  const bars = useMemo(
    () => (file.waveform?.length >= 8 ? file.waveform : fallbackBars(file.url || "")),
    [file.waveform, file.url]
  );

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (currentlyPlaying === audio) currentlyPlaying = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
      currentlyPlaying = audio;
      audio.playbackRate = rate;
      audio.play().catch(() => onError?.());
    } else {
      audio.pause();
    }
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekTo = (clientX) => {
    const el = barsRef.current;
    const audio = audioRef.current;
    if (!el || !audio || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekTo(e.clientX);
  };
  const onPointerMove = (e) => {
    if (e.buttons === 1) seekTo(e.clientX);
  };

  // Browser-recorded webm often reports an infinite length. Jumping to the end
  // once makes the browser work out the real value.
  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration === Infinity || Number.isNaN(audio.duration)) {
      if (!file.duration) {
        const fix = () => {
          audio.removeEventListener("timeupdate", fix);
          setDuration(audio.duration);
          audio.currentTime = 0;
        };
        audio.addEventListener("timeupdate", fix);
        audio.currentTime = 1e101;
      }
    } else if (!file.duration) {
      setDuration(audio.duration);
    }
  };

  const progress = duration ? Math.min(1, current / duration) : 0;
  const shown = playing || current > 0 ? current : duration;

  return (
    <div className="flex items-center gap-2.5 mb-1 min-w-[230px] max-w-[270px] select-none">
      <button
        type="button"
        onClick={toggle}
        className="size-10 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 flex items-center justify-center shrink-0 transition-colors"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={barsRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className="flex items-center gap-[2px] h-7 cursor-pointer touch-none"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${
                i / bars.length < progress ? "bg-white" : "bg-white/35"
              }`}
              style={{ height: `${Math.max(12, h)}%` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] opacity-80 tabular-nums mt-0.5">
          <span>{fmt(shown)}</span>
          {(playing || rate !== 1) && (
            <button type="button" onClick={cycleSpeed} className="px-1.5 rounded-full bg-white/20 font-medium">
              {rate}x
            </button>
          )}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={file.url}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          if (currentlyPlaying === audioRef.current) currentlyPlaying = null;
        }}
        onError={onError}
      />
    </div>
  );
};

export default VoiceMessagePlayer;
