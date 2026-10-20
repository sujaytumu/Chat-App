import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, SwitchCamera, Send, RotateCcw, Loader2 } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

const MAX_SECONDS = 60;
const MIMES = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const R = 138; // progress ring radius (circle is 272px wide)

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Records a short round video message with the camera + mic (browser MediaRecorder: no native plugin),
// lets you watch it back, then hands the clip to `onSend`.
const VideoNoteRecorder = ({ onSend, onClose }) => {
  useBackToClose(true, onClose);
  const [phase, setPhase] = useState("starting"); // starting | ready | recording | review | sending
  const [facing, setFacing] = useState("user");
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState(null); // { blob, url, duration }
  const liveRef = useRef(null);
  const playRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const closed = useRef(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const openCamera = useCallback(async (mode) => {
    stopStream();
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 480 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (closed.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        liveRef.current.play?.().catch(() => {});
      }
      setPhase("ready");
    } catch (e) {
      if (closed.current) return;
      toast.error(e?.message === "unsupported" ? "Video messages aren't supported on this device" : "Camera and microphone access is needed (is a call using the camera?)");
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    openCamera("user");
    return () => {
      closed.current = true;
      clearInterval(timer.current);
      try {
        if (recRef.current?.state === "recording") {
          recRef.current.onstop = null;
          recRef.current.stop();
        }
      } catch {
        /* already stopped */
      }
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clip?.url && URL.revokeObjectURL(clip.url), [clip]);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    openCamera(next);
  };

  const finish = () => {
    clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
  };

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m));
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 });
    } catch {
      toast.error("Couldn't start recording");
      return;
    }
    rec.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const duration = Math.max(1, Math.round((Date.now() - startedAt.current) / 100) / 10);
      const blob = new Blob(chunksRef.current, { type: (rec.mimeType || mimeType || "video/webm").split(";")[0] });
      stopStream();
      if (closed.current) return;
      if (blob.size < 1000) {
        toast.error("Nothing was recorded");
        openCamera(facing);
        return;
      }
      setClip({ blob, url: URL.createObjectURL(blob), duration });
      setPhase("review");
    };
    recRef.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(500);
    setPhase("recording");
    timer.current = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) finish();
    }, 200);
  };

  const retake = () => {
    setClip(null);
    openCamera(facing);
  };

  const send = async () => {
    if (!clip) return;
    if (clip.blob.size > 10 * 1024 * 1024) {
      toast.error("That video is too large. Record a shorter one.");
      return;
    }
    setPhase("sending");
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(clip.blob);
      });
      await onSend({ data, mimeType: clip.blob.type, size: clip.blob.size, duration: clip.duration });
      onClose();
    } catch {
      toast.error("Could not send video message");
      setPhase("review");
    }
  };

  const recording = phase === "recording";
  const progress = Math.min(1, seconds / MAX_SECONDS);
  const C = 2 * Math.PI * R;

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[170] bg-black/95 text-white flex flex-col items-center justify-between pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(28px+env(safe-area-inset-bottom))]">
      <div className="w-full flex items-center justify-between px-4">
        <button onClick={onClose} aria-label="Close" className="size-10 flex items-center justify-center rounded-full bg-white/10">
          <X size={22} />
        </button>
        <span className="text-[14px] font-medium tabular-nums">
          {recording ? <span className="text-[#F15C6D]">● {fmt(seconds)}</span> : phase === "review" ? `${fmt(clip?.duration || 0)}` : "Video message"}
        </span>
        <button onClick={flip} disabled={phase !== "ready"} aria-label="Switch camera" className="size-10 flex items-center justify-center rounded-full bg-white/10 disabled:opacity-30">
          <SwitchCamera size={21} />
        </button>
      </div>

      <div className="relative size-[272px]">
        <div className="absolute inset-1 rounded-full overflow-hidden bg-[#111B21] flex items-center justify-center">
          {phase === "review" || phase === "sending" ? (
            <video
              ref={playRef}
              src={clip?.url}
              autoPlay
              loop
              playsInline
              className="size-full object-cover"
              onClick={(e) => (e.currentTarget.muted = !e.currentTarget.muted)}
            />
          ) : (
            <video ref={liveRef} muted playsInline autoPlay className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
          )}
          {phase === "starting" && <Loader2 className="absolute animate-spin text-white/70" size={32} />}
        </div>
        <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
          {recording && <circle cx="140" cy="140" r={R} fill="none" stroke="#F15C6D" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />}
        </svg>
      </div>

      <div className="h-24 flex flex-col items-center justify-center gap-3">
        {(phase === "starting" || phase === "ready") && (
          <>
            <button onClick={start} disabled={phase !== "ready"} aria-label="Start recording" className="size-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform">
              <span className="size-[52px] rounded-full bg-[#F15C6D]" />
            </button>
            <span className="text-[12px] text-white/60">Tap to record · up to 1 min</span>
          </>
        )}
        {recording && (
          <>
            <button onClick={finish} aria-label="Stop recording" className="size-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform">
              <span className="size-7 rounded-md bg-[#F15C6D]" />
            </button>
            <span className="text-[12px] text-white/60">Tap to stop</span>
          </>
        )}
        {(phase === "review" || phase === "sending") && (
          <div className="flex items-center gap-6">
            <button onClick={retake} disabled={phase === "sending"} className="h-12 px-5 rounded-full bg-white/10 flex items-center gap-2 text-[14px] font-medium disabled:opacity-40">
              <RotateCcw size={18} /> Retake
            </button>
            <button onClick={send} disabled={phase === "sending"} aria-label="Send video message" className="size-14 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-60">
              {phase === "sending" ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VideoNoteRecorder;
