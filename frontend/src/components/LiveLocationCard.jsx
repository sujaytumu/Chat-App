import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import MapThumb from "./MapThumb";

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A live location inside a bubble, like WhatsApp: map with the sender's photo on it, "Live until 10:03",
// and Stop sharing underneath (for the sender). Tap the map to open it in Maps.
const LiveLocationCard = ({ message, isMe, onStop, sender }) => {
  const live = message.liveLocation;
  const [, tick] = useState(0);
  const running = live.active && new Date(live.expiresAt).getTime() > Date.now();
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [running]);
  const url = `https://www.google.com/maps?q=${live.lat},${live.lng}`;

  return (
    <div className="w-[260px] max-w-full overflow-hidden rounded-lg bg-black/10">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <MapThumb lat={live.lat} lng={live.lng} height={150} marker="avatar" avatar={sender?.profilePic} name={sender?.fullName} className={running ? "" : "grayscale opacity-80"} />
      </a>
      {live.comment && <p className="px-3 pt-2 text-[13.5px] break-words">{live.comment}</p>}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <MapPin size={19} className={running ? "text-[#25D366]" : "text-wa-text/50"} />
        <p className="text-[14px] text-wa-text/90">{running ? `Live until ${clock(live.expiresAt)}` : "Live location ended"}</p>
      </div>
      {isMe && running && (
        <button type="button" onClick={onStop} className="w-full border-t border-white/10 py-3 text-[15px] font-medium text-[#F15C6D] active:bg-white/5">
          Stop sharing
        </button>
      )}
    </div>
  );
};

export default LiveLocationCard;
