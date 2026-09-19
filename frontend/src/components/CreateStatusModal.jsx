import { useState, useRef } from "react";
import { X, Type, Image as ImageIcon, Loader2 } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { compressImage } from "../lib/imageUtils";
import toast from "react-hot-toast";

const COLORS = ["#00A884", "#0B141A", "#7f66ff", "#ff8f4d", "#e91e8c", "#22c55e", "#2563eb"];

const CreateStatusModal = ({ onClose, onCreated }) => {
  const [mode, setMode] = useState(null); // "text" | "image"
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(COLORS[0]);
  const [imagePreview, setImagePreview] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef(null);

  const handleImagePick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, { maxDimension: 1080, quality: 0.8 });
      setImagePreview(compressed);
      setMode("image");
    } catch {
      toast.error("Could not process that image");
    }
  };

  const handlePost = async () => {
    setIsPosting(true);
    try {
      if (mode === "text") {
        if (!text.trim()) return toast.error("Write something first");
        await axiosInstance.post("/status", { type: "text", content: text.trim(), backgroundColor: bgColor });
      } else {
        await axiosInstance.post("/status", { type: "image", content: imagePreview });
      }
      toast.success("Status posted");
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to post status");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#1F2C34] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-white">Add status</h3>
          <button onClick={onClose} className="text-[#8696A0] hover:text-white">
            <X size={20} />
          </button>
        </div>

        {!mode && (
          <div className="p-6 flex flex-col gap-3">
            <button
              onClick={() => setMode("text")}
              className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white"
            >
              <Type size={20} className="text-[#00A884]" /> Text status
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white"
            >
              <ImageIcon size={20} className="text-[#bf59cf]" /> Photo status
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImagePick} />
          </div>
        )}

        {mode === "text" && (
          <div className="p-4">
            <div
              className="rounded-xl h-48 flex items-center justify-center p-4 mb-3"
              style={{ backgroundColor: bgColor }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a status…"
                autoFocus
                maxLength={140}
                className="bg-transparent text-white text-xl text-center placeholder:text-white/60 resize-none focus:outline-none w-full h-full flex items-center"
              />
            </div>
            <div className="flex gap-2 justify-center mb-4">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  className={`size-7 rounded-full ${bgColor === c ? "ring-2 ring-white" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {mode === "image" && imagePreview && (
          <div className="p-4">
            <img src={imagePreview} alt="Status preview" className="w-full max-h-64 object-contain rounded-xl mb-4" />
          </div>
        )}

        {mode && (
          <div className="p-4 border-t border-white/10">
            <button
              onClick={handlePost}
              disabled={isPosting}
              className="btn w-full bg-[#00A884] hover:bg-[#02906f] text-white border-none"
            >
              {isPosting ? <Loader2 className="animate-spin" size={18} /> : "Post status"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateStatusModal;
