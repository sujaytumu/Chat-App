import { Music, FileText } from "lucide-react";
import { optimizeImage } from "../lib/cdn";

// A small picture of one status: the photo, the first frame of a video, or the coloured card of a text status.
const StatusThumb = ({ s, width = 240, className = "" }) => {
  if (!s) return null;
  if (s.type === "image") {
    return <img src={optimizeImage(s.content, width)} alt="" loading="lazy" decoding="async" draggable={false} className={`size-full object-cover ${className}`} />;
  }
  if (s.type === "video") {
    return <video src={`${s.content}#t=0.1`} muted playsInline preload="metadata" className={`size-full object-cover pointer-events-none ${className}`} />;
  }
  if (s.type === "text") {
    return (
      <div className={`size-full flex items-center justify-center p-2 text-center overflow-hidden ${className}`} style={{ background: s.backgroundColor || "#00A884" }}>
        <span className="text-white text-[10px] leading-tight font-medium line-clamp-5 break-words">{s.content}</span>
      </div>
    );
  }
  const Icon = s.type === "audio" ? Music : FileText;
  return (
    <div className={`size-full flex items-center justify-center bg-[#1f2c34] text-white/80 ${className}`}>
      <Icon size={20} />
    </div>
  );
};

export default StatusThumb;
