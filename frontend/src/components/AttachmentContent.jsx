import { useState } from "react";
import { FileText, Music, Download, AlertCircle } from "lucide-react";
import { formatFileSize, fileIconKind } from "../lib/fileUtils";

const DownloadFallbackCard = ({ file, label }) => (
  <a
    href={file.url}
    target="_blank"
    rel="noopener noreferrer"
    download={file.name}
    className="flex items-center gap-2.5 mb-1 min-w-[200px] max-w-[240px] bg-white/10 rounded-lg p-2 hover:bg-white/15 transition-colors"
  >
    <div className="size-9 rounded-md bg-white/10 flex items-center justify-center shrink-0">
      <AlertCircle size={17} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{file.name}</p>
      <p className="text-xs opacity-70">{label} · tap to download</p>
    </div>
    <Download size={15} className="shrink-0 opacity-70" />
  </a>
);

// Renders the non-text part of a message: video, audio, or a generic
// downloadable document card. Falls back to a download card if the
// browser can't actually play the video/audio format (common across
// different browsers/devices for recorded voice notes and videos).
const AttachmentContent = ({ file }) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);

  if (!file?.url) return null;

  if (file.type === "video") {
    if (videoFailed) return <DownloadFallbackCard file={file} label="Video" />;
    return (
      <video
        src={file.url}
        controls
        preload="metadata"
        onError={() => setVideoFailed(true)}
        className="max-w-[240px] rounded-md mb-1 bg-black"
      />
    );
  }

  if (file.type === "audio") {
    if (audioFailed) return <DownloadFallbackCard file={file} label="Voice message" />;
    return (
      <div className="flex items-center gap-2 mb-1 min-w-[220px]">
        <Music size={18} className="shrink-0 opacity-70" />
        <audio src={file.url} controls onError={() => setAudioFailed(true)} className="h-9 max-w-[200px]" />
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
      className="flex items-center gap-2.5 mb-1 min-w-[200px] max-w-[240px] bg-white/10 rounded-lg p-2 hover:bg-white/15 transition-colors"
    >
      <div className="size-9 rounded-md bg-white/10 flex items-center justify-center shrink-0">
        <FileText size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs opacity-70">{kind.toUpperCase()} · {formatFileSize(file.size)}</p>
      </div>
      <Download size={15} className="shrink-0 opacity-70" />
    </a>
  );
};

export default AttachmentContent;
