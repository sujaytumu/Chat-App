import { useRef, useState } from "react";

const SPEEDS = [1, 1.5, 2, 0.5];

// <video> with a WhatsApp-style speed chip (1x → 1.5x → 2x → 0.5x).
const SpeedVideo = ({ wrapperClassName = "", chipClassName = "", ...props }) => {
  const ref = useRef(null);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);

  const cycle = (e) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  return (
    <div className={`relative inline-block ${wrapperClassName}`}>
      <video
        ref={ref}
        {...props}
        onPlay={(e) => {
          e.currentTarget.playbackRate = rate;
          setPlaying(true);
          props.onPlay?.(e);
        }}
        onPause={(e) => {
          setPlaying(false);
          props.onPause?.(e);
        }}
      />
      {(playing || rate !== 1) && (
        <button
          type="button"
          onClick={cycle}
          aria-label="Playback speed"
          className={`absolute top-2 right-2 h-7 min-w-[40px] px-2 rounded-full bg-black/60 text-white text-[12px] font-semibold tabular-nums active:scale-95 backdrop-blur-sm ${chipClassName}`}
        >
          {rate}x
        </button>
      )}
    </div>
  );
};

export default SpeedVideo;
