import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Link2, Play, Download, X } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";
import ImageLightbox from "./ImageLightbox";

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const fmtSize = (b) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Small hook shared by the info-screen preview strip and the full screen.
export function useChatMedia(chatType, chatId) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    axiosInstance
      .get(`/messages/media/${chatType}/${chatId}`)
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData({ media: [], docs: [], links: [] }));
    return () => {
      alive = false;
    };
  }, [chatType, chatId]);
  return data;
}

export const MediaThumb = ({ item, className = "", onClick }) => (
  <button type="button" onClick={onClick} className={`relative overflow-hidden bg-[#1F2C34] ${className}`}>
    {item.kind === "image" ? (
      <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
    ) : (
      <>
        <video src={item.url} preload="metadata" muted className="size-full object-cover" />
        <span className="absolute left-1.5 bottom-1 flex items-center gap-1 text-[12px] text-white drop-shadow">
          <Play size={12} fill="white" /> {fmtDur(item.duration)}
        </span>
      </>
    )}
  </button>
);

const ChatMediaPanel = ({ data, title, onClose }) => {
  const [tab, setTab] = useState("media");
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  useBackToClose(true, onClose);

  const tabs = [
    ["media", "Media", data?.media.length],
    ["docs", "Docs", data?.docs.length],
    ["links", "Links", data?.links.length],
  ];
  const empty = <p className="text-center text-[#8696A0] py-16 text-[15px]">Nothing here yet</p>;

  return (
    <div className="fixed inset-0 z-[96] bg-[#0B141A] text-[#E9EDEF] flex flex-col sm:max-w-md sm:mx-auto">
      <div className="flex items-center gap-5 px-4 h-14 shrink-0 bg-[#111B21]">
        <button onClick={onClose} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h3 className="text-[19px] truncate">{title}</h3>
      </div>
      <div className="flex shrink-0 bg-[#111B21] border-b border-white/10">
        {tabs.map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-[15px] border-b-2 ${tab === id ? "border-[#00A884] text-[#00A884]" : "border-transparent text-[#8696A0]"}`}
          >
            {label}
            {n ? ` (${n})` : ""}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!data ? (
          <p className="text-center text-[#8696A0] py-16">Loading…</p>
        ) : tab === "media" ? (
          data.media.length ? (
            <div className="grid grid-cols-3 gap-0.5">
              {data.media.map((m) => (
                <MediaThumb
                  key={m._id}
                  item={m}
                  className="aspect-square"
                  onClick={() => (m.kind === "image" ? setImage(m.url) : setVideo(m.url))}
                />
              ))}
            </div>
          ) : (
            empty
          )
        ) : tab === "docs" ? (
          data.docs.length ? (
            data.docs.map((d) => (
              <a
                key={d._id}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                download={d.name}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5"
              >
                <span className="size-11 rounded-lg bg-[#1F2C34] flex items-center justify-center shrink-0">
                  <FileText size={22} className="text-[#8696A0]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px]">{d.name || "Document"}</span>
                  <span className="block text-[13px] text-[#8696A0]">
                    {[fmtSize(d.size), fmtDate(d.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Download size={18} className="text-[#8696A0]" />
              </a>
            ))
          ) : (
            empty
          )
        ) : data.links.length ? (
          data.links.map((l) => (
            <a key={l._id} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5">
              <span className="size-11 rounded-lg bg-[#1F2C34] flex items-center justify-center shrink-0">
                <Link2 size={22} className="text-[#8696A0]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-[#53BDEB]">{l.url}</span>
                <span className="block text-[13px] text-[#8696A0]">{fmtDate(l.createdAt)}</span>
              </span>
            </a>
          ))
        ) : (
          empty
        )}
      </div>

      {image && <ImageLightbox src={image} onClose={() => setImage(null)} />}
      {video && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setVideo(null)}>
          <button className="absolute top-4 right-4 text-white" aria-label="Close">
            <X size={26} />
          </button>
          <video src={video} controls autoPlay className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default ChatMediaPanel;
