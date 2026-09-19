import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { axiosInstance } from "../lib/axios";

const StatusViewer = ({ user, statuses, isOwn, onClose }) => {
  const [index, setIndex] = useState(0);
  const current = statuses[index];

  useEffect(() => {
    if (!isOwn && current) {
      axiosInstance.put(`/status/${current._id}/view`).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?._id]);

  if (!current) return null;

  const next = () => setIndex((i) => Math.min(i + 1, statuses.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="fixed inset-0 z-[150] bg-black flex items-center justify-center">
      <div className="absolute top-0 inset-x-0 flex gap-1 p-2 z-10">
        {statuses.map((s, i) => (
          <div key={s._id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div className={`h-full bg-white ${i < index ? "w-full" : i === index ? "w-full" : "w-0"}`} />
          </div>
        ))}
      </div>

      <div className="absolute top-6 left-4 flex items-center gap-2 z-10">
        <img src={user.profilePic || "/avatar.png"} alt={user.fullName} className="size-9 rounded-full object-cover" />
        <span className="text-white text-sm font-medium">{user.fullName}</span>
      </div>

      <button onClick={onClose} className="absolute top-6 right-4 text-white z-10">
        <X size={24} />
      </button>

      <div className="w-full h-full max-w-md flex items-center justify-center relative">
        {index > 0 && (
          <button onClick={prev} className="absolute left-2 z-10 text-white/70 hover:text-white">
            <ChevronLeft size={28} />
          </button>
        )}
        {index < statuses.length - 1 && (
          <button onClick={next} className="absolute right-2 z-10 text-white/70 hover:text-white">
            <ChevronRight size={28} />
          </button>
        )}

        {current.type === "text" ? (
          <div
            className="w-full h-full flex items-center justify-center p-8"
            style={{ backgroundColor: current.backgroundColor }}
          >
            <p className="text-white text-2xl text-center break-words">{current.content}</p>
          </div>
        ) : (
          <img src={current.content} alt="Status" className="max-w-full max-h-full object-contain" />
        )}
      </div>

      {isOwn && (
        <div className="absolute bottom-6 left-4 flex items-center gap-1.5 text-white/80 text-sm">
          <Eye size={16} /> {current.viewedBy?.length || 0} viewed
        </div>
      )}
    </div>
  );
};

export default StatusViewer;
