import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { useChatStore } from "../store/useChatStore";
import {
  Paperclip,
  X,
  Loader2,
  Image as ImageIcon,
  FileText,
  Music,
  Video as VideoIcon,
  Mic,
  Trash2,
  MapPin,
  Smile,
  Camera,
} from "lucide-react";
import WhatsAppSendIcon from "./icons/WhatsAppSendIcon";
import toast from "react-hot-toast";
import { compressImage } from "../lib/imageUtils";
import { readFileAsBase64, formatFileSize, MAX_FILE_SIZE_MB } from "../lib/fileUtils";

const EmojiStickerPicker = lazy(() => import("./EmojiStickerPicker"));

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFallback, setImageFallback] = useState(null); // { data, name } — image we can't locally preview (e.g. HEIC) but can still send
  const [filePreview, setFilePreview] = useState(null); // { data, name, mimeType, size, kind }
  const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const discardRecordingRef = useRef(false);

  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const textareaRef = useRef(null);
  const attachMenuRef = useRef(null);
  const { sendMessage, emitTyping, emitStopTyping, selectedChat, replyingTo, clearReplyingTo } = useChatStore();

  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  };

  const clearAttachments = () => {
    setImagePreview(null);
    setImageFallback(null);
    setFilePreview(null);
    [photoInputRef, cameraInputRef, documentInputRef, audioInputRef].forEach((ref) => {
      if (ref.current) ref.current.value = "";
    });
  };

  // "Photo & Video" input: images get compressed, videos are read as-is.
  // Some phones (notably iPhones by default) save photos as HEIC, which most
  // non-Safari browsers can't decode via <img>/canvas — compression fails
  // there. Rather than blocking the send, fall back to uploading the raw
  // file: Cloudinary transcodes HEIC server-side reliably even though the
  // browser can't preview it locally.
  const handlePhotoOrVideoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setShowAttachMenu(false);
    clearAttachments();

    const looksLikeVideo =
      file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|3gp)$/i.test(file.name);
    const looksLikeImage =
      file.type.startsWith("image/") ||
      (!file.type && /\.(heic|heif|jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name));

    if (looksLikeImage) {
      setIsProcessingAttachment(true);
      try {
        const compressed = await compressImage(file);
        setImagePreview(compressed);
      } catch {
        // Fallback: send the original file untouched
        try {
          if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast.error(`Image must be under ${MAX_FILE_SIZE_MB}MB`);
          } else {
            const data = await readFileAsBase64(file);
            setImageFallback({ data, name: file.name });
          }
        } catch {
          toast.error("Could not read that image");
        }
      } finally {
        setIsProcessingAttachment(false);
      }
      return;
    }

    if (looksLikeVideo) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`Video must be under ${MAX_FILE_SIZE_MB}MB`);
        return;
      }
      setIsProcessingAttachment(true);
      try {
        const data = await readFileAsBase64(file);
        setFilePreview({ data, name: file.name, mimeType: file.type, size: file.size, kind: "video" });
      } catch {
        toast.error("Could not read that video");
      } finally {
        setIsProcessingAttachment(false);
      }
      return;
    }

    toast.error("Please select a photo or video");
  };

  const handleDocumentChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setShowAttachMenu(false);
    clearAttachments();

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setIsProcessingAttachment(true);
    try {
      const data = await readFileAsBase64(file);
      setFilePreview({ data, name: file.name, mimeType: file.type, size: file.size, kind: "document" });
    } catch {
      toast.error("Could not read that file");
    } finally {
      setIsProcessingAttachment(false);
    }
  };

  const handleAudioChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setShowAttachMenu(false);
    clearAttachments();

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Audio must be under ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setIsProcessingAttachment(true);
    try {
      const data = await readFileAsBase64(file);
      setFilePreview({ data, name: file.name, mimeType: file.type, size: file.size, kind: "audio" });
    } catch {
      toast.error("Could not read that audio file");
    } finally {
      setIsProcessingAttachment(false);
    }
  };

  const handleTyping = () => {
    emitTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitStopTyping(), 1500);
  };

  const handleShareLocation = () => {
    setShowAttachMenu(false);
    if (!navigator.geolocation) {
      toast.error("Location isn't available in this browser");
      return;
    }
    setIsSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await sendMessage({
            text: `📍 Current location\nhttps://www.google.com/maps?q=${latitude},${longitude}`,
          });
        } catch {
          // toast already shown by store
        } finally {
          setIsSharingLocation(false);
        }
      },
      () => {
        toast.error("Couldn't get your location — check location permission");
        setIsSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleEmojiSelect = (emoji) => {
    setText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleStickerSelect = async (sticker) => {
    setShowEmojiPicker(false);
    try {
      await sendMessage({ text: sticker });
    } catch {
      // toast already shown by store
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;

      // Loudness profile for the waveform shown on the voice note (sampled while recording)
      const peaks = [];
      let analyserTimer = null;
      let audioCtx = null;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        analyserTimer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let max = 0;
          for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i] - 128));
          peaks.push(max / 128); // 0..1
        }, 100);
      } catch {
        // no analyser available — the player falls back to a generic waveform
      }
      const startedAt = Date.now();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(recordingIntervalRef.current);
        clearInterval(analyserTimer);
        audioCtx?.close().catch(() => {});
        const duration = (Date.now() - startedAt) / 1000;
        // squash the samples into 40 bars, scaled so the loudest bar is full height
        const BARS = 40;
        let waveform;
        if (peaks.length >= 8) {
          const per = peaks.length / BARS;
          const raw = Array.from({ length: BARS }, (_, i) => {
            const slice = peaks.slice(Math.floor(i * per), Math.max(Math.floor(i * per) + 1, Math.floor((i + 1) * per)));
            return Math.max(...slice);
          });
          const top = Math.max(...raw, 0.05);
          waveform = raw.map((v) => Math.round(Math.max(0.08, v / top) * 100));
        }

        if (discardRecordingRef.current || audioChunksRef.current.length === 0) {
          setIsRecording(false);
          setRecordingSeconds(0);
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        setIsSending(true);
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Failed to read recording"));
            reader.readAsDataURL(blob);
          });
          await sendMessage({
            text: "",
            file: { data, name: `Voice message.webm`, mimeType: blob.type, size: blob.size, duration, waveform },
          });
        } catch {
          toast.error("Could not send voice message");
        } finally {
          setIsSending(false);
          setIsRecording(false);
          setRecordingSeconds(0);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access is needed to record a voice message");
    }
  };

  const stopRecording = (discard = false) => {
    discardRecordingRef.current = discard;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    return () => {
      clearInterval(recordingIntervalRef.current);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !imagePreview && !imageFallback && !filePreview) || isSending) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitStopTyping();

    setIsSending(true);
    try {
      const payload = { text: text.trim() };
      if (imagePreview) payload.image = imagePreview;
      else if (imageFallback) payload.image = imageFallback.data;
      if (filePreview) {
        payload.file = {
          data: filePreview.data,
          name: filePreview.name,
          mimeType: filePreview.mimeType,
          size: filePreview.size,
        };
      }
      await sendMessage(payload);

      setText("");
      clearAttachments();
      if (textareaRef.current) textareaRef.current.style.height = "40px";
    } catch {
      // toast already shown by store
    } finally {
      setIsSending(false);
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    resizeTextarea();
    handleTyping();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() || imagePreview || imageFallback || filePreview) {
        handleSendMessage(e);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      emitStopTyping();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat]);

  const hasAttachment = imagePreview || imageFallback || filePreview;

  return (
    <div className="px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 lg:px-8 lg:pt-2 lg:pb-4 w-full lg:[&>*]:w-full lg:[&>*]:max-w-[880px] lg:[&>*]:mx-auto">
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 bg-wa-field rounded-lg pl-3 pr-2 py-2">
          <div className="flex-1 min-w-0 border-l-2 border-[#00A884] pl-2">
            <p className="text-xs font-medium text-[#00A884]">Replying to</p>
            <p className="text-xs text-wa-muted truncate">
              {replyingTo.image ? "📷 Photo" : replyingTo.file ? `📎 ${replyingTo.file.name}` : replyingTo.text}
            </p>
          </div>
          <button onClick={clearReplyingTo} className="text-wa-muted hover:text-wa-text shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      {imagePreview && (
        <div className="mb-2.5 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-white/10"
            />
            <button
              onClick={clearAttachments}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-wa-field text-wa-text flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {imageFallback && (
        <div className="mb-2.5 flex items-center gap-2 bg-wa-field rounded-lg p-2 pr-3 max-w-xs shadow-sm">
          <div className="size-10 rounded-md bg-white/10 flex items-center justify-center shrink-0">
            <ImageIcon size={18} className="text-[#00A884]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-wa-text">{imageFallback.name}</p>
            <p className="text-xs text-wa-muted">Photo · preview unavailable, will still send</p>
          </div>
          <button
            onClick={clearAttachments}
            type="button"
            className="size-6 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {filePreview && (
        <div className="mb-2.5 flex items-center gap-2 bg-wa-field rounded-lg p-2 pr-3 max-w-xs shadow-sm">
          <div className="size-10 rounded-md bg-white/10 flex items-center justify-center shrink-0">
            {filePreview.kind === "video" && <VideoIcon size={18} className="text-[#00A884]" />}
            {filePreview.kind === "audio" && <Music size={18} className="text-[#00A884]" />}
            {filePreview.kind === "document" && <FileText size={18} className="text-[#00A884]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-wa-text">{filePreview.name}</p>
            <p className="text-xs text-wa-muted">{formatFileSize(filePreview.size)}</p>
          </div>
          <button
            onClick={clearAttachments}
            type="button"
            className="size-6 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSendMessage}
        className={`flex items-end gap-1 ${isRecording ? "" : "bg-wa-surface rounded-[28px] px-1.5 py-1 shadow-sm"}`}
      >
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-wa-surface rounded-full px-4 py-2 min-h-[48px]">
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="text-wa-muted hover:text-red-400 transition-colors shrink-0"
              title="Cancel recording"
            >
              <Trash2 size={19} />
            </button>
            <span className="size-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-wa-text2 text-sm tabular-nums">{formatDuration(recordingSeconds)}</span>
            <span className="text-wa-muted text-xs ml-auto hidden sm:inline">Recording voice message…</span>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-end gap-0.5">
            <div className="relative" ref={attachMenuRef}>
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-wa-pop rounded-xl shadow-2xl py-1.5 w-52 z-10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-wa-text2"
                  >
                    <span className="size-8 rounded-full bg-[#bf59cf] flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-white" />
                    </span>
                    Photo &amp; Video
                  </button>
                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-wa-text2"
                  >
                    <span className="size-8 rounded-full bg-[#7f66ff] flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-white" />
                    </span>
                    Document
                  </button>
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-wa-text2"
                  >
                    <span className="size-8 rounded-full bg-[#ff8f4d] flex items-center justify-center shrink-0">
                      <Music size={16} className="text-white" />
                    </span>
                    Audio
                  </button>
                  <button
                    type="button"
                    onClick={handleShareLocation}
                    disabled={isSharingLocation}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-wa-text2"
                  >
                    <span className="size-8 rounded-full bg-[#22c55e] flex items-center justify-center shrink-0">
                      {isSharingLocation ? (
                        <Loader2 size={16} className="text-white animate-spin" />
                      ) : (
                        <MapPin size={16} className="text-white" />
                      )}
                    </span>
                    Location
                  </button>
                </div>
              )}

              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                ref={photoInputRef}
                onChange={handlePhotoOrVideoChange}
              />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={cameraInputRef}
                onChange={handlePhotoOrVideoChange}
              />
              <input type="file" className="hidden" ref={documentInputRef} onChange={handleDocumentChange} />
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                ref={audioInputRef}
                onChange={handleAudioChange}
              />

              <button
                type="button"
                onClick={() => setShowAttachMenu((s) => !s)}
                className="size-10 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
                disabled={isProcessingAttachment}
                aria-label="Attach"
              >
                {isProcessingAttachment ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Paperclip size={22} className="rotate-45" />
                )}
              </button>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((s) => !s)}
                className="size-10 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
                aria-label="Emoji and stickers"
              >
                <Smile size={24} />
              </button>
              {showEmojiPicker && (
                <Suspense fallback={null}>
                  <EmojiStickerPicker
                    onEmojiSelect={handleEmojiSelect}
                    onStickerSelect={handleStickerSelect}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </Suspense>
              )}
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 min-w-0 resize-none bg-transparent px-1.5 py-2 text-[16px] leading-[22px] max-h-32 min-h-[40px] text-wa-text placeholder:text-wa-muted focus:outline-none"
              style={{ overflow: "hidden" }}
            />

            {!text.trim() && !hasAttachment && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="lg:hidden size-10 rounded-full flex items-center justify-center text-wa-muted hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
                disabled={isProcessingAttachment}
                aria-label="Take a photo"
                title="Camera"
              >
                <Camera size={22} />
              </button>
            )}
          </div>
        )}

        {!isRecording && (text.trim() || hasAttachment) ? (
          <button
            type="submit"
            className="size-10 mb-0 rounded-full flex items-center justify-center bg-[#00A884] hover:bg-[#02906f] active:scale-95 text-white shrink-0 transition-all"
            disabled={isSending}
            aria-label="Send"
          >
            {isSending ? <Loader2 size={20} className="animate-spin" /> : <WhatsAppSendIcon size={20} className="ml-0.5" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? () => stopRecording(false) : startRecording}
            className={`size-10 rounded-full flex items-center justify-center active:scale-95 shrink-0 transition-all ${isRecording ? "bg-[#00A884] hover:bg-[#02906f] text-white" : "text-wa-muted hover:bg-white/10"}`}
            disabled={isSending}
            aria-label={isRecording ? "Send voice message" : "Record voice message"}
            title={isRecording ? "Send voice message" : "Record voice message"}
          >
            {isSending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isRecording ? (
              <WhatsAppSendIcon size={20} className="ml-0.5" />
            ) : (
              <Mic size={23} />
            )}
          </button>
        )}
      </form>
    </div>
  );
};

export default MessageInput;
