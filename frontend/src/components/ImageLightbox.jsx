import { X, Download } from "lucide-react";
import { useEffect } from "react";

const ImageLightbox = ({ src, onClose }) => {
  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex gap-2">
        <a
          href={src}
          download
          onClick={(e) => e.stopPropagation()}
          className="btn btn-circle btn-sm bg-black/40 border-none hover:bg-black/60 text-white"
        >
          <Download size={18} />
        </a>
        <button
          onClick={onClose}
          className="btn btn-circle btn-sm bg-black/40 border-none hover:bg-black/60 text-white"
        >
          <X size={18} />
        </button>
      </div>
      <img
        src={src}
        alt="Full size attachment"
        className="max-w-full max-h-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default ImageLightbox;
