import { useEffect, useRef, useState } from "react";
import { Mic, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { useCallStore } from "../store/useCallStore";
import { axiosInstance } from "../lib/axios";
import Avatar from "./Avatar";

const MAX_SECONDS = 60;

// After a call isn't answered (or is declined), offers to leave a short voice message in the chat instead.
const LeaveMessageSheet = () => {
  const user = useCallStore((s) => s.leaveMessageFor);
  const dismiss = useCallStore((s) => s.dismissLeaveMessage);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const startedRef = useRef(0);
  const cancelRef = useRef(false);
  const timerRef = useRef(null);

  const stopTimer = () => clearInterval(timerRef.current);

  const close = () => {
    cancelRef.current = true;
    stopTimer();
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
      recRef.current?.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* already stopped */
    }
    setRecording(false);
    setSeconds(0);
    dismiss();
  };

  useEffect(() => () => stopTimer(), []);

  const send = async (blob, duration) => {
    if (!user?._id) return;
    setSending(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(blob);
      });
      await axiosInstance.post(`/messages/send/${user._id}`, {
        text: "",
        file: { data, name: "Voice message.webm", mimeType: blob.type, size: blob.size, duration },
      });
      toast.success("Voice message sent");
      dismiss();
    } catch {
      toast.error("Couldn't send the voice message");
    } finally {
      setSending(false);
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRef.current || !chunksRef.current.length) return;
        const duration = (Date.now() - startedRef.current) / 1000;
        send(new Blob(chunksRef.current, { type: mimeType || "audio/webm" }), duration);
      };
      startedRef.current = Date.now();
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS && rec.state === "recording") finish();
      }, 250);
    } catch {
      toast.error("Microphone access is needed to leave a voice message");
    }
  };

  const finish = () => {
    stopTimer();
    setRecording(false);
    try {
      recRef.current?.state === "recording" && recRef.current.stop();
    } catch {
      /* already stopped */
    }
  };

  if (!user) return null;
  const first = (user.fullName || "They").split(" ")[0];
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50" onClick={() => !recording && !sending && close()}>
      <div className="w-full max-w-md bg-wa-panel rounded-t-3xl px-5 pt-5 pb-[calc(22px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Avatar src={user.profilePic} name={user.fullName} size="size-12" textSize="text-lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-wa-text truncate">{first} didn&apos;t pick up</p>
            <p className="text-[13px] text-wa-muted">Leave a voice message instead?</p>
          </div>
          <button onClick={close} aria-label="Close" className="text-wa-muted p-1">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-4">
          {recording && <span className="tabular-nums text-wa-text text-[15px]">0:{String(seconds).padStart(2, "0")}</span>}
          <button
            onClick={recording ? finish : start}
            disabled={sending}
            className={`h-12 px-6 rounded-full flex items-center gap-2 text-white font-medium active:scale-95 transition disabled:opacity-60 ${recording ? "bg-[#F15C6D]" : "bg-[#00A884]"}`}
          >
            {recording ? <Send size={18} /> : <Mic size={18} />}
            {sending ? "Sending…" : recording ? "Send" : "Record message"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveMessageSheet;
