import { MapPin, ExternalLink } from "lucide-react";

const LocationCard = ({ location }) => (
  <a
    href={location.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-2.5 mb-1 min-w-[220px] max-w-[260px] bg-white/10 rounded-lg p-2.5 hover:bg-white/15 transition-colors"
  >
    <div className="size-10 rounded-md bg-[#22c55e]/20 flex items-center justify-center shrink-0">
      <MapPin size={19} className="text-[#22c55e]" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">Current location</p>
      <p className="text-xs opacity-70 truncate">Tap to open in Maps</p>
    </div>
    <ExternalLink size={14} className="shrink-0 opacity-60" />
  </a>
);

export default LocationCard;
