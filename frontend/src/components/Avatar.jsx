import { UsersRound } from "lucide-react";
import { optimizeImage } from "../lib/cdn";

// WhatsApp-style fallback: a dark tinted circle with the person's initial in a
// matching bright colour, instead of one generic silhouette for everyone.
const PALETTE = [
  ["#3A2A18", "#E8A33D"],
  ["#12362B", "#25D366"],
  ["#2B2142", "#B794F6"],
  ["#12303F", "#53BDEB"],
  ["#3F1F2B", "#F472B6"],
  ["#2F3A12", "#A3E635"],
];

const paletteFor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

// size: a Tailwind size class (e.g. "size-14"); textSize scales the initial.
const Avatar = ({ src, name = "", isGroup = false, size = "size-14", textSize = "text-2xl", className = "" }) => {
  const base = `${size} rounded-full shrink-0 ${className}`;

  if (src) {
    return (
      <img
        src={optimizeImage(src, 120)}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${base} object-cover`}
      />
    );
  }

  if (isGroup) {
    return (
      <div className={`${base} bg-wa-surface flex items-center justify-center`}>
        <UsersRound className="size-1/2 text-wa-muted" />
      </div>
    );
  }

  const [bg, fg] = paletteFor(name);
  return (
    <div
      className={`${base} flex items-center justify-center font-medium select-none ${textSize}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {name?.trim()?.[0]?.toUpperCase() || "?"}
    </div>
  );
};

export default Avatar;
