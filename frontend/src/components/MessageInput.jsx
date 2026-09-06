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
    <div className="p-3 sm:p-4 w-full bg-[#F0F0F0] border-t border-black/5">
      {imagePreview && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-zinc-300"
            />
            <button
              onClick={clearAttachments}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300 flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {filePreview && (
        <div className="mb-3 flex items-center gap-2 bg-white rounded-lg p-2 pr-3 max-w-xs shadow-sm">
          <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            {filePreview.kind === "video" && <VideoIcon size={18} className="text-primary" />}
            {filePreview.kind === "audio" && <Music size={18} className="text-primary" />}
            {filePreview.kind === "document" && <FileText size={18} className="text-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{filePreview.name}</p>
            <p className="text-xs text-zinc-500">{formatFileSize(filePreview.size)}</p>
          </div>
          <button onClick={clearAttachments} type="button" className="btn btn-xs btn-circle btn-ghost">
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-end gap-2">
        <div className="relative" ref={attachMenuRef}>
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-base-100 rounded-xl shadow-xl border border-base-300 py-1.5 w-48 z-10">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 text-sm"
              >
                <ImageIcon size={18} className="text-fuchsia-500" /> Photo &amp; Video
              </button>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 text-sm"
              >
                <FileText size={18} className="text-indigo-500" /> Document
              </button>
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 text-sm"
              >
                <Music size={18} className="text-orange-500" /> Audio
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
            className="hidden"
            ref={documentInputRef}
            onChange={handleDocumentChange}
          />
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
            className={`btn btn-circle btn-sm sm:btn-md border-none ${
              hasAttachment ? "bg-primary text-primary-content" : "bg-white text-zinc-500"
            }`}
            disabled={isProcessingAttachment}
          >
            {isProcessingAttachment ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Paperclip size={20} className="rotate-45" />
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
          className="flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-sm sm:text-[15px] max-h-32 min-h-[42px] placeholder:text-zinc-400 shadow-sm border border-black/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ overflow: "hidden" }}
        />

        <button
          type="submit"
          className="btn btn-circle btn-sm sm:btn-md bg-[#25D366] hover:bg-[#1fb356] border-none text-white shrink-0 disabled:bg-zinc-300"
          disabled={(!text.trim() && !hasAttachment) || isSending}
        >
          {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} className="ml-0.5" />}
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
