import { useRef, useState } from "react";
import { Play } from "lucide-react";

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const R = 96;
const C = 2 * Math.PI * R;

// A round video message in the chat: tap to play with sound, ring shows progress, time shows what's left.
const VideoNotePlayer = ({ file, onError, onLoadedMetadata }) => {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const total = Number(file.duration) || 0;

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const len = total || (Number.isFinite(ref.current?.duration) ? ref.current.duration : 0);
  const shown = playing || t > 0 ? Math.max(0, len - t) : len;

  return (
    <div className="relative mb-1 size-[200px] max-w-full select-none" onClick={toggle}>
      <div className="absolute inset-[3px] rounded-full overflow-hidden bg-black">
        <video
          ref={ref}
          src={`${file.url}#t=0.1`}
          playsInline
          preload="metadata"
          className="size-full object-cover"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setT(0);
          }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onLoadedMetadata={onLoadedMetadata}
          onError={onError}
        />
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="size-12 rounded-full bg-black/55 flex items-center justify-center">
              <Play size={22} fill="white" className="ml-0.5 text-white" />
            </span>
          </span>
        )}
      </div>
      <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 200 200">
        {len > 0 && t > 0 && <circle cx="100" cy="100" r={R} fill="none" stroke="#21C063" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, t / len))} />}
      </svg>
      {len > 0 && <span className="absolute left-3 bottom-3 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[11px] tabular-nums">{fmt(shown)}</span>}
    </div>
  );
};

export default VideoNotePlayer;
