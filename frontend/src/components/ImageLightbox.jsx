import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen picture viewer. With `gallery` (a list of picture addresses) you can
// swipe / use the arrows to move between the pictures of the chat, and double-tap to zoom.
const ImageLightbox = ({ src, gallery, onClose }) => {
  // Phone Back closes the full-size picture.
  useBackToClose(!!src, onClose);

  const list = gallery?.length && gallery.includes(src) ? gallery : src ? [src] : [];
  const [i, setI] = useState(() => Math.max(0, list.indexOf(src)));
  const [zoom, setZoom] = useState(false);
  const [dx, setDx] = useState(0);
  const touch = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setI(Math.max(0, list.indexOf(src)));
    setZoom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const go = (n) => {
    if (n < 0 || n >= list.length) return;
    setZoom(false);
    setI(n);
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === "ArrowRight") go(i + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, i, list.length]);

  if (!src) return null;
  const cur = list[i] || src;

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return (touch.current = null);
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  };
  const onTouchMove = (e) => {
    const t = touch.current;
    if (!t || zoom) return;
    const d = e.touches[0].clientX - t.x;
    if (Math.abs(d) > 8 && Math.abs(d) > Math.abs(e.touches[0].clientY - t.y)) {
      t.moved = true;
      // a little resistance at the first / last picture
      const edge = (d > 0 && i === 0) || (d < 0 && i === list.length - 1);
      setDx(edge ? d * 0.25 : d);
    }
  };
  const onTouchEnd = () => {
    const t = touch.current;
    touch.current = null;
    if (t?.moved) {
      if (dx < -70) go(i + 1);
      else if (dx > 70) go(i - 1);
      setDx(0);
    } else {
      const now = Date.now();
      if (now - lastTap.current < 280) setZoom((z) => !z);
      lastTap.current = now;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-6 bg-gradient-to-b from-black/60 to-transparent">
        {list.length > 1 && <span className="text-white/90 text-[13px] pl-1 tabular-nums">{i + 1} / {list.length}</span>}
        <span className="flex-1" />
        <a
          href={cur}
          download
          onClick={(e) => e.stopPropagation()}
          className="size-10 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 text-white"
          aria-label="Download"
        >
          <Download size={20} />
        </a>
        <button
          onClick={onClose}
          className="size-10 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 text-white"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      </div>

      {list.length > 1 && i > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(i - 1);
          }}
          className="hidden sm:flex absolute left-3 z-10 size-11 rounded-full items-center justify-center bg-black/40 hover:bg-black/60 text-white"
          aria-label="Previous picture"
        >
          <ChevronLeft size={26} />
        </button>
      )}
      {list.length > 1 && i < list.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            go(i + 1);
          }}
          className="hidden sm:flex absolute right-3 z-10 size-11 rounded-full items-center justify-center bg-black/40 hover:bg-black/60 text-white"
          aria-label="Next picture"
        >
          <ChevronRight size={26} />
        </button>
      )}

      <div
        className="w-full h-full flex items-center justify-center p-3 touch-pan-y overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          key={cur}
          src={cur}
          alt="Full size attachment"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setZoom((z) => !z);
          }}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            translate: `${dx}px 0`,
            scale: zoom ? 2.2 : 1,
            transition: dx ? "none" : "scale .22s ease, translate .22s ease",
            cursor: zoom ? "zoom-out" : "zoom-in",
            animation: "m-fade .2s ease-out",
          }}
        />
      </div>
    </div>
  );
};

export default ImageLightbox;
