import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import StatusViewer from "../components/StatusViewer";

// Opened from a shared highlight link (…/highlight?h=<id>): plays that highlight, then returns to Updates.
const HighlightLinkPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.authUser?._id);
  const id = params.get("h");
  const [h, setH] = useState(null);

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
      return undefined;
    }
    let live = true;
    axiosInstance
      .get(`/highlights/${encodeURIComponent(id)}`)
      .then((r) => live && setH(r.data))
      .catch(() => {
        if (!live) return;
        toast.error("That highlight isn't available");
        navigate("/status", { replace: true });
      });
    return () => {
      live = false;
    };
  }, [id, navigate]);

  if (!h) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  return <StatusViewer user={h.user} statuses={h.items} isOwn={String(h.user?._id) === String(me)} highlight={h} onClose={() => navigate("/status", { replace: true })} />;
};

export default HighlightLinkPage;
