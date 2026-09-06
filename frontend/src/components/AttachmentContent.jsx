import { FileText, Music, Download } from "lucide-react";
import { formatFileSize, fileIconKind } from "../lib/fileUtils";

// Renders the non-text part of a message: video, audio, or a generic
// downloadable document card.
const AttachmentContent = ({ file }) => {
  if (!file?.url) return null;

  if (file.type === "video") {
    return (
      <video
        src={file.url}
        controls
        preload="metadata"
        className="max-w-[240px] rounded-md mb-1 bg-black"
      />
    );
  }

  if (file.type === "audio") {
    return (
      <div className="flex items-center gap-2 mb-1 min-w-[220px]">
        <Music size={18} className="shrink-0 opacity-70" />
        <audio src={file.url} controls className="h-9 max-w-[200px]" />
      </div>
    );
  }

  const kind = fileIconKind(file.name);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      download={file.name}
      className="flex items-center gap-2.5 mb-1 min-w-[200px] max-w-[240px] bg-black/5 rounded-lg p-2 hover:bg-black/10 transition-colors"
    >
      <div className="size-9 rounded-md bg-black/10 flex items-center justify-center shrink-0">
        <FileText size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs opacity-60">{kind.toUpperCase()} · {formatFileSize(file.size)}</p>
      </div>
      <Download size={15} className="shrink-0 opacity-60" />
    </a>
  );
};

export default AttachmentContent;
