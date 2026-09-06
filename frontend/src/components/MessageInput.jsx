import { useRef, useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import {
  Paperclip,
  Send,
  X,
  Loader2,
  Image as ImageIcon,
  FileText,
  Music,
  Video as VideoIcon,
  Mic,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { compressImage } from "../lib/imageUtils";
import { readFileAsBase64, formatFileSize, MAX_FILE_SIZE_MB } from "../lib/fileUtils";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [filePreview, setFilePreview] = useState(null); // { data, name, mimeType, size, kind }
  const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const discardRecordingRef = useRef(false);

  const photoInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const textareaRef = useRef(null);
  const attachMenuRef = useRef(null);
  const { sendMessage, emitTyping, emitStopTyping, selectedChat } = useChatStore();

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
    setFilePreview(null);
    [photoInputRef, documentInputRef, audioInputRef].forEach((ref) => {
      if (ref.current) ref.current.value = "";
    });
  };

  // "Photo & Video" input: images get compressed, videos are read as-is
  const handlePhotoOrVideoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setShowAttachMenu(false);
    clearAttachments();

    if (file.type.startsWith("image/")) {
      setIsProcessingAttachment(true);
      try {
        const compressed = await compressImage(file);
        setImagePreview(compressed);
      } catch {
        toast.error("Could not process that image");
      } finally {
        setIsProcessingAttachment(false);
      }
      return;
    }

    if (file.type.startsWith("video/")) {
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(recordingIntervalRef.current);

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
            file: { data, name: `Voice message.webm`, mimeType: blob.type, size: blob.size },
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
    if ((!text.trim() && !imagePreview && !filePreview) || isSending) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitStopTyping();

    setIsSending(true);
    try {
      const payload = { text: text.trim() };
      if (imagePreview) payload.image = imagePreview;
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
      if (text.trim() || imagePreview || filePreview) {
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

  const hasAttachment = imagePreview || filePreview;

  return (
    <div className="px-3 py-2.5 sm:px-4 sm:py-3 w-full bg-[#202C33]">
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
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2A3942] text-[#E9EDEF] flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {filePreview && (
        <div className="mb-2.5 flex items-center gap-2 bg-[#2A3942] rounded-lg p-2 pr-3 max-w-xs shadow-sm">
          <div className="size-10 rounded-md bg-white/10 flex items-center justify-center shrink-0">
            {filePreview.kind === "video" && <VideoIcon size={18} className="text-[#00A884]" />}
            {filePreview.kind === "audio" && <Music size={18} className="text-[#00A884]" />}
            {filePreview.kind === "document" && <FileText size={18} className="text-[#00A884]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-[#E9EDEF]">{filePreview.name}</p>
            <p className="text-xs text-[#8696A0]">{formatFileSize(filePreview.size)}</p>
          </div>
          <button
            onClick={clearAttachments}
            type="button"
            className="size-6 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-end gap-2">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-[#2A3942] rounded-lg px-4 py-2.5 min-h-[42px]">
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="text-[#8696A0] hover:text-red-400 transition-colors shrink-0"
              title="Cancel recording"
            >
              <Trash2 size={19} />
            </button>
            <span className="size-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[#D1D7DB] text-sm tabular-nums">{formatDuration(recordingSeconds)}</span>
            <span className="text-[#8696A0] text-xs ml-auto hidden sm:inline">Recording voice message…</span>
          </div>
        ) : (
          <>
            <div className="relative" ref={attachMenuRef}>
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-[#233138] rounded-xl shadow-2xl py-1.5 w-52 z-10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-[#D1D7DB]"
                  >
                    <span className="size-8 rounded-full bg-[#bf59cf] flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-white" />
                    </span>
                    Photo &amp; Video
                  </button>
                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-[#D1D7DB]"
                  >
                    <span className="size-8 rounded-full bg-[#7f66ff] flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-white" />
                    </span>
                    Document
                  </button>
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-[#D1D7DB]"
                  >
                    <span className="size-8 rounded-full bg-[#ff8f4d] flex items-center justify-center shrink-0">
                      <Music size={16} className="text-white" />
                    </span>
                    Audio
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
                className="size-10 rounded-full flex items-center justify-center text-[#8696A0] hover:bg-white/10 transition-colors shrink-0"
                disabled={isProcessingAttachment}
              >
                {isProcessingAttachment ? (
                  <Loader2 size={21} className="animate-spin" />
                ) : (
                  <Paperclip size={22} className="rotate-45" />
                )}
              </button>
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              className="flex-1 resize-none rounded-lg bg-[#2A3942] px-4 py-2.5 text-[15px] max-h-32 min-h-[42px] text-[#D1D7DB] placeholder:text-[#8696A0] focus:outline-none"
              style={{ overflow: "hidden" }}
            />
          </>
        )}

        {!isRecording && (text.trim() || hasAttachment) ? (
          <button
            type="submit"
            className="size-10 rounded-full flex items-center justify-center bg-[#00A884] hover:bg-[#02906f] text-white shrink-0 transition-colors"
            disabled={isSending}
          >
            {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} className="ml-0.5" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? () => stopRecording(false) : startRecording}
            className="size-10 rounded-full flex items-center justify-center bg-[#00A884] hover:bg-[#02906f] text-white shrink-0 transition-colors"
            disabled={isSending}
            title={isRecording ? "Send voice message" : "Record voice message"}
          >
            {isSending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isRecording ? (
              <Send size={19} className="ml-0.5" />
            ) : (
              <Mic size={20} />
            )}
          </button>
        )}
      </form>
    </div>
  );
};

export default MessageInput;
