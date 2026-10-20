import { useEffect, useState } from "react";
import { MapPin, ExternalLink, Navigation } from "lucide-react";

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 15) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A live location inside a message bubble: small map, who is moving, until when, and Stop (for the sender).
const LiveLocationCard = ({ message, isMe, onStop }) => {
  const live = message.liveLocation;
  const [, tick] = useState(0);
  const running = live.active && new Date(live.expiresAt).getTime() > Date.now();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, [running]);

  const d = 0.004;
  const map = `https://www.openstreetmap.org/export/embed.html?bbox=${live.lng - d},${live.lat - d},${live.lng + d},${live.lat + d}&layer=mapnik&marker=${live.lat},${live.lng}`;
  const url = `https://www.google.com/maps?q=${live.lat},${live.lng}`;

  return (
    <div className="w-[250px] max-w-full pb-4">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block relative h-[110px] rounded-lg overflow-hidden bg-white/10">
        <iframe title="Live location map" src={map} loading="lazy" className={`size-full border-0 pointer-events-none ${running ? "" : "grayscale opacity-70"}`} />
      </a>
      <div className="mt-2 flex items-center gap-2.5">
        <span className={`relative size-9 shrink-0 rounded-full flex items-center justify-center ${running ? "bg-[#F15C6D]/20 text-[#F15C6D]" : "bg-white/10 text-wa-text/60"}`}>
          {running && <span className="absolute inset-0 rounded-full bg-[#F15C6D]/30 animate-ping" />}
          <Navigation size={17} className="relative" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight">{running ? "Live location" : "Live location ended"}</p>
          <p className="text-[12px] text-wa-text/70 truncate">
            {running ? `Updated ${ago(live.updatedAt)} · until ${clock(live.expiresAt)}` : `Last seen ${clock(live.updatedAt)}`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 h-9 rounded-full border border-wa-text/25 text-[12.5px] font-medium text-wa-text/90 flex items-center justify-center gap-1.5">
          <ExternalLink size={14} /> Open in Maps
        </a>
        {isMe && running && (
          <button type="button" onClick={onStop} className="flex-1 h-9 rounded-full bg-[#F15C6D] text-white text-[12.5px] font-medium">
            Stop sharing
          </button>
        )}
      </div>
    </div>
  );
};

export default LiveLocationCard;
