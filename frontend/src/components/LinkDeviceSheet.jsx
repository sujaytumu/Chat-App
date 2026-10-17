import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Loader2, Monitor } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";

// Scanner for "Link a device": reads the QR shown on another device's login
// page, asks for confirmation, then approves that login.
export default function LinkDeviceSheet({ onClose, onDone, initialCode }) {
  const video = useRef(null);
  const [found, setFound] = useState(null); // {code, device}
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async (code) => {
    try {
      const { data } = await axiosInstance.get(`/auth/qr/info/${encodeURIComponent(code)}`);
      setFound({ code, device: data.device || "a new device" });
    } catch (e) {
      setError(e?.response?.data?.message || "This QR code isn't valid or has expired.");
    }
  };

  useEffect(() => {
    if (initialCode) {
      lookup(initialCode);
      return;
    }
    let stream, raf, stop = false;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stop) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current;
        v.srcObject = stream;
        await v.play();
        const scan = () => {
          if (stop) return;
          if (v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(v, 0, 0);
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(d.data, d.width, d.height);
            if (res?.data?.startsWith("talkies-link:")) {
              stop = true;
              stream.getTracks().forEach((t) => t.stop());
              lookup(res.data.slice("talkies-link:".length));
              return;
            }
          }
          raf = requestAnimationFrame(scan);
        };
        scan();
      } catch {
        setError("Camera access is needed to scan the code.");
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line
  }, []);

  const approve = async () => {
    setBusy(true);
    try {
      await axiosInstance.post("/auth/qr/approve", { code: found.code });
      toast.success("Device linked");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Couldn't link the device");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-pop text-wa-text rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-medium">Link a device</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 rounded-full hover:bg-white/10 flex items-center justify-center"><X size={20} /></button>
        </div>
        {found ? (
          <div className="text-center space-y-4 py-2">
            <Monitor size={44} className="mx-auto text-[#25D366]" />
            <p className="text-[15px]">Log in to Talkies on <b>{found.device}</b>?</p>
            <p className="text-[12.5px] text-wa-muted">Only continue if you just opened this QR code yourself.</p>
            <div className="flex gap-3">
              <button className="flex-1 h-11 rounded-full bg-white/10" onClick={onClose}>Cancel</button>
              <button className="flex-1 h-11 rounded-full bg-[#25D366] text-black font-medium disabled:opacity-60" disabled={busy} onClick={approve}>
                {busy ? <Loader2 className="animate-spin inline" size={18} /> : "Link device"}
              </button>
            </div>
          </div>
        ) : error ? (
          <p className="text-center text-[14px] text-red-400 py-8">{error}</p>
        ) : (
          <>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video ref={video} playsInline muted className="size-full object-cover" />
              <div className="absolute inset-[18%] border-2 border-white/80 rounded-2xl pointer-events-none" />
            </div>
            <p className="text-center text-[13px] text-wa-muted mt-3">Point your camera at the QR code on the login page of the other device.</p>
          </>
        )}
      </div>
    </div>
  );
}
