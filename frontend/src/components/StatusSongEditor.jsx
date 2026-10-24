import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Play, Pause, ChevronDown, Check, Music } from "lucide-react";

// WhatsApp's "pick the part of the song" screen: the waveform slides under a fixed window, you choose how
// long the status plays (15 – 30 s), and the chosen part loops while you listen.
export const SONG_LENGTHS = [15, 20, 25, 30];
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const StatusSongEditor = ({ song, onDone, onRemove, onClose }) => {
  const audio = useRef(null);
  const canvas = useRef(null);
  const strip = useRef(null);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState(null);
  const [length, setLength] = useState(song.length || 15);
  const [start, setStart] = useState(song.start || 0);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [menu, setMenu] = useState(false);
  const [width, setWidth] = useState(Math.min(window.innerWidth, 480));
  const drag = useRef(null);

  const len = Math.min(length, duration || length);
  const pxPerSec = width / 45; // 45 seconds fit across the screen
  const winW = len * pxPerSec;
  const winLeft = (width - winW) / 2;
  const maxStart = Math.max(0, duration - len);

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth, 480));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The song itself: length + loudness profile for the waveform.
  useEffect(() => {
    let dead = false;
    const a = new Audio(song.data);
    a.preload = "auto";
    audio.current = a;
    a.onloadedmetadata = () => !dead && Number.isFinite(a.duration) && setDuration(a.duration);
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    (async () => {
      try {
        const buf = await (await fetch(song.data)).arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close?.();
        if (dead) return;
        setDuration(decoded.duration);
        const ch = decoded.getChannelData(0);
        const perSec = 10;
        const n = Math.max(1, Math.floor(decoded.duration * perSec));
        const block = Math.floor(ch.length / n);
        const out = new Array(n);
        let max = 0.0001;
        for (let i = 0; i < n; i++) {
          let sum = 0;
          for (let j = 0; j < block; j += 40) sum += Math.abs(ch[i * block + j] || 0);
          out[i] = sum / (block / 40);
          if (out[i] > max) max = out[i];
        }
        setPeaks(out.map((v) => v / max));
      } catch {
        /* can't read the shape: a plain pattern is drawn instead */
      }
    })();
    return () => {
      dead = true;
      a.pause();
      audio.current = null;
    };
  }, [song.data]);

  // Keep the chosen part in range when the length / song changes.
  useEffect(() => {
    if (duration && start > maxStart) setStart(maxStart);
  }, [duration, len, maxStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview plays only the chosen part, looping.
  useEffect(() => {
    const a = audio.current;
    if (!a) return undefined;
    const tick = setInterval(() => {
      if (!a.paused) {
        if (a.currentTime >= start + len || a.currentTime < start - 0.3) a.currentTime = start;
        setNow(Math.max(0, a.currentTime - start));
      }
    }, 120);
    return () => clearInterval(tick);
  }, [start, len]);

  // Start playing the chosen part as soon as the song is ready, and whenever the window moves.
  const first = useRef(true);
  useEffect(() => {
    const a = audio.current;
    if (!a || !duration) return;
    a.currentTime = start;
    setNow(0);
    if (first.current) {
      first.current = false;
      a.play().catch(() => {});
    }
  }, [start, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Waveform drawing.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !duration) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.ceil(duration * pxPerSec);
    const h = 84;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const step = 4;
    for (let x = 0; x < w; x += step) {
      const t = x / pxPerSec;
      let v;
      if (peaks) v = peaks[Math.min(peaks.length - 1, Math.floor(t * 10))];
      else v = 0.35 + 0.35 * Math.abs(Math.sin(x * 0.37) * Math.cos(x * 0.11));
      const bh = Math.max(4, v * (h - 8));
      const inWin = t >= start && t < start + len;
      const played = inWin && t - start <= now;
      g.fillStyle = played ? "#21C063" : inWin ? "#ffffff" : "rgba(255,255,255,.35)";
      g.fillRect(x, (h - bh) / 2, 2, bh);
    }
  }, [duration, peaks, pxPerSec, start, len, now]);

  const onDown = (e) => {
    drag.current = { x: e.clientX, start };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const d = (e.clientX - drag.current.x) / pxPerSec;
    setStart(Math.min(maxStart, Math.max(0, drag.current.start - d)));
  };
  const onUp = () => {
    drag.current = null;
  };

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (a.currentTime < start || a.currentTime >= start + len) a.currentTime = start;
      a.play().catch(() => {});
    } else a.pause();
  };

  const lengths = useMemo(() => {
    const ok = SONG_LENGTHS.filter((l) => !duration || l <= Math.ceil(duration));
    return ok.length ? ok : [Math.max(5, Math.floor(duration || 15))];
  }, [duration]);

  const finish = () => {
    audio.current?.pause();
    onDone({ ...song, start: Math.round(start * 10) / 10, length: Math.round(len) });
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col select-none" style={{ touchAction: "none" }}>
      <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <button onClick={onRemove} className="size-11 rounded-full bg-white/10 flex items-center justify-center" aria-label="Remove song">
          <Trash2 size={20} />
        </button>
        <button onClick={onClose} className="sr-only" aria-label="Close" />
        <button onClick={finish} className="h-11 px-7 rounded-full bg-white text-black font-medium text-[16px]">
          Done
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="size-24 rounded-full bg-gradient-to-br from-[#21C063] to-[#0b6b3a] flex items-center justify-center">
          <Music size={40} />
        </div>
        <p className="text-[26px] font-light leading-tight line-clamp-3 break-words max-w-full">{song.name || "Song"}</p>
        <p className="text-[13px] text-white/60">Drag the waveform to choose the part that plays</p>
      </div>

      {/* play / progress */}
      <div className="px-4 flex items-center gap-4 mb-3">
        <button onClick={toggle} className="size-11 flex items-center justify-center" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
        </button>
        <div className="flex-1 h-0.5 bg-white/30 relative rounded">
          <div className="absolute inset-y-0 left-0 bg-[#21C063] rounded" style={{ width: `${Math.min(100, (now / Math.max(len, 1)) * 100)}%` }} />
        </div>
        <span className="text-[15px] tabular-nums text-white/80">{fmt(now)} / {fmt(len)}</span>
      </div>

      {/* length */}
      <div className="flex justify-center mb-3 relative">
        <button onClick={() => setMenu((m) => !m)} className="h-11 px-5 rounded-full bg-white/10 flex items-center gap-2 text-[17px]">
          {Math.round(len)}s <ChevronDown size={18} />
        </button>
        {menu && (
          <div className="absolute bottom-14 bg-[#1f2428] rounded-2xl py-2 w-32 shadow-2xl z-10">
            {lengths.map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLength(l);
                  setMenu(false);
                }}
                className="w-full flex items-center justify-between px-5 py-2.5 text-[16px] active:bg-white/10"
              >
                {l}s {Math.round(len) === l && <Check size={16} className="text-[#21C063]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* waveform under a fixed window */}
      <div
        ref={strip}
        className="relative overflow-hidden mx-auto mb-[max(24px,env(safe-area-inset-bottom))] cursor-grab active:cursor-grabbing"
        style={{ width, height: 96 }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="absolute top-1 left-0" style={{ transform: `translateX(${winLeft - start * pxPerSec}px)` }}>
          <canvas ref={canvas} />
        </div>
        <div className="absolute top-0 bottom-0 rounded-xl border-[3px] border-white pointer-events-none" style={{ left: winLeft - 3, width: winW + 6 }} />
      </div>
    </div>,
    document.body
  );
};

export default StatusSongEditor;
