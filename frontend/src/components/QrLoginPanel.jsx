import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";

// "Log in with QR": shows a code that a phone already signed in to Talkies scans
// (Settings → Linked devices → Link a device). Polls until the phone approves it.
export default function QrLoginPanel() {
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(false);
  const [round, setRound] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer;
    (async () => {
      setImg(null);
      setErr(false);
      try {
        const { data } = await axiosInstance.post("/auth/qr/new");
        const url = await QRCode.toDataURL(`talkies-link:${data.code}`, { margin: 1, width: 240 });
        if (!alive.current) return;
        setImg(url);
        const tick = async () => {
          if (!alive.current) return;
          try {
            const r = await axiosInstance.post("/auth/qr/poll", { code: data.code, poll: data.poll });
            if (r.data?.status === "approved") {
              useAuthStore.setState({ authUser: r.data.user });
              useAuthStore.getState().connectSocket();
              return;
            }
          } catch (e) {
            if (e?.response?.status === 410) return setRound((n) => n + 1); // expired → new code
          }
          timer = setTimeout(tick, 2000);
        };
        timer = setTimeout(tick, 2000);
      } catch {
        if (alive.current) setErr(true);
      }
    })();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [round]);

  return (
    <div className="text-center space-y-3 pt-2">
      <div className="divider text-xs text-base-content/50">or</div>
      <p className="text-sm font-medium flex items-center justify-center gap-1.5">
        <QrCode size={16} /> Log in with QR code
      </p>
      <div className="mx-auto size-[240px] rounded-xl bg-white flex items-center justify-center">
        {img ? <img src={img} alt="Login QR code" className="size-full" /> : err ? (
          <button className="btn btn-sm" onClick={() => setRound((n) => n + 1)}>Retry</button>
        ) : <Loader2 className="animate-spin text-black/50" />}
      </div>
      <p className="text-xs text-base-content/60">
        On your phone open Talkies → ⋮ → Linked devices → Link a device, then scan this code.
      </p>
    </div>
  );
}
