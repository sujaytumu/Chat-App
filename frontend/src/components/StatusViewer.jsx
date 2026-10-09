import { useCallback, useEffect, useRef, useState } from "react";
import { X, Eye, Trash2, Loader2, ChevronUp, Music, MapPin, Headphones, FileText, Download } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";

const DURATION_MS = 5000; // how long a picture / text stays up, like WhatsApp

const sizeLabel = (b) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Turns web links in text into tappable links.
const linkify = (text) =>
  String(text)
    .split(/(https?:\/\/[^\s<>"']+)/gi)
    .map((part, i) =>
      /^https?:\/\//i.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="underline text-[#53BDEB] break-all">
          {part}
        </a>
      ) : (
        part
      )
    );

const ago = (iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return `${days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${t}`;
};

const StatusViewer = ({ user, statuses: initial, isOwn, onClose }) => {
  const [list, setList] = useState(initial);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 of the current update
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const current = list[index];
  const [mediaMs, setMediaMs] = useState(0); // length of the current video / audio
  const mediaEl = useRef(null);
  const songEl = useRef(null);
  useBackToClose(true, onClose);

  // Mark as seen when someone else's update comes up.
  useEffect(() => {
    if (!isOwn && current) axiosInstance.put(`/status/${current._id}/view`).catch(() => {});
    setProgress(0);
    setMediaMs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?._id]);

  const next = useCallback(() => {
    if (index >= list.length - 1) onClose();
    else setIndex((i) => i + 1);
  }, [index, list.length, onClose]);
  const prev = () => (index > 0 ? setIndex((i) => i - 1) : setProgress(0));

  // Timer: fills the bar, then moves on. Held still while paused / a sheet is open.
  const stop = paused || showViewers || confirmDelete;
  const last = useRef(0);
  useEffect(() => {
    if (!current || stop) return;
    last.current = performance.now();
    let raf;
    const tick = (now) => {
      const dt = now - last.current;
      last.current = now;
      setProgress((p) => {
        const isMedia = current.type === "video" || current.type === "audio";
        const total = isMedia ? Math.max(mediaMs, 1000) : DURATION_MS;
        const np = p + dt / total;
        if (np >= 1) {
          queueMicrotask(next);
          return 1;
        }
        return np;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current?._id, stop, next, mediaMs]);

  // Video / audio / song play only while the status is actually running.
  useEffect(() => {
    for (const el of [mediaEl.current, songEl.current]) {
      if (!el) continue;
      if (stop) el.pause();
      else el.play?.().catch(() => {});
    }
  }, [stop, current?._id, mediaMs]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await axiosInstance.delete(`/status/${current._id}`);
      toast.success("Status deleted");
      const rest = list.filter((s) => s._id !== current._id);
      setConfirmDelete(false);
      if (rest.length === 0) return onClose();
      setList(rest);
      setIndex((i) => Math.min(i, rest.length - 1));
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't delete the status");
    } finally {
      setDeleting(false);
    }
  };

  if (!current) return null;

  const views = (current.views || []).filter((v) => v.user).sort((a, b) => new Date(b.at) - new Date(a.at));
  const viewCount = Math.max(views.length, current.viewedBy?.length || 0);

  return (
    <div className="wa-dark fixed inset-0 z-[150] bg-black flex items-center justify-center select-none">
      {/* Progress bars */}
      <div className="absolute top-0 inset-x-0 flex gap-1 px-2 pt-[calc(8px+env(safe-area-inset-top))] z-20">
        {list.map((s, i) => (
          <div key={s._id} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%` }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-[calc(18px+env(safe-area-inset-top))] inset-x-0 flex items-center gap-3 px-3 z-20 bg-gradient-to-b from-black/50 to-transparent pb-6 pt-1">
        <img src={user.profilePic || "/avatar.png"} alt={user.fullName} className="size-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-white text-[16px] font-medium truncate">{isOwn ? "My status" : user.fullName}</p>
          <p className="text-white/80 text-[13px] truncate">{ago(current.createdAt)}</p>
          {current.song?.url && (
            <p className="flex items-center gap-1.5 text-white text-[13px] leading-5 min-w-0">
              <Music size={13} className="shrink-0" />
              <span className="truncate">{current.song.name || "Song"}</span>
            </p>
          )}
          {current.location?.name && (
            <a
              href={
                current.location.lat != null
                  ? `https://www.google.com/maps/search/?api=1&query=${current.location.lat},${current.location.lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.location.name)}`
              }
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-white/90 text-[13px] leading-5 min-w-0"
            >
              <MapPin size={13} className="shrink-0 text-[#F15C6D]" />
              <span className="truncate">{current.location.name}</span>
            </a>
          )}
        </div>
        {isOwn && (
          <button onClick={() => setConfirmDelete(true)} className="size-10 flex items-center justify-center text-white" aria-label="Delete status">
            <Trash2 size={22} />
          </button>
        )}
        <button onClick={onClose} className="size-10 flex items-center justify-center text-white" aria-label="Close">
          <X size={26} />
        </button>
      </div>

      {/* The update; tap left / right to move, hold to pause */}
      <div
        className="w-full h-full max-w-md relative flex items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
      >
        {current.type === "text" && (
          <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: current.backgroundColor }}>
            <p className="text-white text-[28px] leading-snug text-center break-words whitespace-pre-wrap">{linkify(current.content)}</p>
          </div>
        )}
        {current.type === "image" && <img src={current.content} alt="Status" className="max-w-full max-h-full object-contain" draggable={false} />}
        {current.type === "video" && (
          <video
            ref={mediaEl}
            src={current.content}
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain"
            onLoadedMetadata={(e) => setMediaMs(Math.round((e.currentTarget.duration || 0) * 1000))}
            onEnded={next}
          />
        )}
        {current.type === "audio" && (
          <div className="flex flex-col items-center gap-5 px-8 text-center">
            <span className="size-28 rounded-full bg-[#ff8f4d] flex items-center justify-center">
              <Headphones size={48} className="text-white" />
            </span>
            <p className="text-white text-[17px] break-all">{current.file?.name || "Audio"}</p>
            <audio
              ref={mediaEl}
              src={current.content}
              autoPlay
              onLoadedMetadata={(e) => setMediaMs(Math.round((e.currentTarget.duration || 0) * 1000))}
              onEnded={next}
            />
          </div>
        )}
        {current.type === "file" && (
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <span className="size-24 rounded-2xl bg-[#7f66ff] flex items-center justify-center">
              <FileText size={44} className="text-white" />
            </span>
            <p className="text-white text-[17px] break-all">{current.file?.name || "File"}</p>
            <p className="text-white/70 text-[14px]">{sizeLabel(current.file?.size)}</p>
            <a
              href={current.content}
              target="_blank"
              rel="noreferrer"
              download={current.file?.name}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="relative z-30 mt-1 flex items-center gap-2 rounded-full bg-[#00A884] text-white px-6 py-3 text-[15.5px]"
            >
              <Download size={18} /> Open / download
            </a>
          </div>
        )}
        {current.song?.url && <audio ref={songEl} src={current.song.url} autoPlay loop />}

        {/* Caption */}
        {current.caption && (
          <p className={`absolute inset-x-0 ${isOwn ? "bottom-16" : "bottom-0 pb-[calc(16px+env(safe-area-inset-bottom))]"} z-20 px-5 py-3 text-center text-white text-[16px] bg-black/50 break-words`}>
            {linkify(current.caption)}
          </p>
        )}
        <button className="absolute left-0 top-24 bottom-24 w-1/3" onClick={prev} aria-label="Previous" />
        <button className="absolute right-0 top-24 bottom-24 w-1/3" onClick={next} aria-label="Next" />
      </div>

      {/* Owner: who has seen it */}
      {isOwn && (
        <button
          onClick={() => setShowViewers(true)}
          className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-center gap-0.5 pt-6 pb-[calc(14px+env(safe-area-inset-bottom))] text-white bg-gradient-to-t from-black/70 to-transparent"
        >
          <ChevronUp size={20} className="text-white/80" />
          <span className="flex items-center gap-1.5 text-[15px]">
            <Eye size={18} /> {viewCount}
          </span>
        </button>
      )}

      {/* Viewers sheet */}
      {showViewers && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end" onClick={() => setShowViewers(false)}>
          <div
            className="w-full max-w-md mx-auto max-h-[75%] bg-wa-panel rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center gap-3 px-5 py-3">
              <Eye size={20} className="text-wa-muted" />
              <h3 className="flex-1 text-[18px] text-wa-text">Viewed by {viewCount}</h3>
              <button onClick={() => setShowViewers(false)} className="text-wa-muted" aria-label="Close">
                <X size={22} />
              </button>
            </div>
            <div className="overflow-y-auto pb-3">
              {views.length === 0 ? (
                <p className="text-center text-wa-muted py-10 text-[15px]">
                  {viewCount > 0 ? "Viewer names aren't available for this older update." : "No views yet"}
                </p>
              ) : (
                views.map((v) => (
                  <div key={v.user._id} className="flex items-center gap-3 px-5 py-2.5">
                    <img src={v.user.profilePic || "/avatar.png"} alt="" className="size-11 rounded-full object-cover" />
                    <div className="min-w-0">
                      <p className="text-[16px] text-wa-text truncate">{v.user.fullName}</p>
                      <p className="text-[13.5px] text-wa-muted">{ago(v.at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-6" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-wa-pop p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[18px] text-wa-text mb-1">Delete this status update?</h3>
            <p className="text-[14px] text-wa-muted mb-5">It will be removed for everyone who could see it.</p>
            <div className="flex justify-end gap-6 text-[15.5px]">
              <button onClick={() => setConfirmDelete(false)} className="text-[#21C063]" disabled={deleting}>
                Cancel
              </button>
              <button onClick={handleDelete} className="text-[#F15C6D] flex items-center gap-1.5" disabled={deleting}>
                {deleting && <Loader2 size={14} className="animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusViewer;
