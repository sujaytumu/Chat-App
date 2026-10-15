import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

export const MAX_STATUS_VIDEO_SECONDS = 90;

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// WhatsApp-style preview of a video picked for a status: shows the first frame
// straight away, tap to play / pause, a seek bar, and (only when the clip is
// longer than 90 s) a slider to choose which 90 s to share. Videos up to 90 s
// are shown and sent in full.
const StatusVideoPreview = ({ src, duration, trim, onTrimChange, children }) => {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const [failed, setFailed] = useState(false);

  const start = trim ? trim.start : 0;
  const end = trim ? trim.end : total;
  const len = Math.max(end - start, 0.1);
  const needsTrim = total > MAX_STATUS_VIDEO_SECONDS;

  // Keep playback inside the chosen window.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.currentTime < start || el.currentTime > end) el.currentTime = start;
    setNow(Math.min(Math.max(el.currentTime, start), end));
  }, [start, end]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      if (el.currentTime >= end - 0.05 || el.currentTime < start) el.currentTime = start;
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  };

  const onTime = (e) => {
    const el = e.currentTarget;
    if (el.currentTime >= end) {
      el.pause();
      el.currentTime = start;
    }
    setNow(Math.min(Math.max(el.currentTime, start), end));
  };

  const seek = (e) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = start + (Number(e.target.value) / 1000) * len;
    setNow(el.currentTime);
  };

  return (
    <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center" onClick={toggle}>
      {/* #t=0.05 makes the browser decode and show a real frame before playing */}
      <video
        ref={ref}
        src={`${src}#t=0.05`}
        preload="auto"
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setTotal(d);
            if (d > MAX_STATUS_VIDEO_SECONDS && !trim) onTrimChange?.({ start: 0, end: MAX_STATUS_VIDEO_SECONDS });
          }
        }}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (ref.current) ref.current.currentTime = start;
        }}
        onError={() => setFailed(true)}
      />

      {failed && (
        <p className="absolute inset-x-8 top-1/2 -translate-y-1/2 text-center text-[14px] text-white/80">
          This phone can't preview this video format, but it can still be posted.
        </p>
      )}

      {!playing && !failed && (
        <span className="absolute size-[72px] rounded-full bg-black/55 text-white flex items-center justify-center pointer-events-none">
          <Play size={34} fill="currentColor" className="ml-1" />
        </span>
      )}

      <div onClick={(e) => e.stopPropagation()}>{children}</div>

      {/* Bottom: time, seek bar, optional trim */}
      <div
        className="absolute bottom-0 inset-x-0 px-4 pt-10 pb-2 bg-gradient-to-t from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        {needsTrim && trim && (
          <div className="mb-3 rounded-2xl bg-[#101418]/90 px-4 py-3">
            <div className="flex items-center justify-between text-[12.5px] text-white/85 mb-1">
              <span>Trim to {fmt(MAX_STATUS_VIDEO_SECONDS)}</span>
              <span>
                {fmt(trim.start)} – {fmt(trim.end)} of {fmt(total)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.floor(total - MAX_STATUS_VIDEO_SECONDS))}
              step={1}
              value={Math.round(trim.start)}
              onChange={(e) => {
                const s = Number(e.target.value);
                onTrimChange?.({ start: s, end: Math.min(total, s + MAX_STATUS_VIDEO_SECONDS) });
              }}
              aria-label="Choose which part to share"
              className="w-full accent-[#21C063]"
            />
            <p className="text-[11px] text-white/55 mt-0.5">Videos longer than 90 seconds are trimmed. Slide to pick the part.</p>
          </div>
        )}
        <div className="flex items-center gap-3 text-white text-[13px]">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="shrink-0">
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <span className="tabular-nums shrink-0">
            {fmt(now - start)} / {fmt(len)}
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(((now - start) / len) * 1000)}
            onChange={seek}
            aria-label="Seek"
            className="flex-1 min-w-0 accent-[#21C063]"
          />
          <button onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} className="shrink-0">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatusVideoPreview;
