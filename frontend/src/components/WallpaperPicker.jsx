import { useRef, useState } from "react";
import { X, Image as ImageIcon, Check } from "lucide-react";
import toast from "react-hot-toast";
import WallpaperCropper from "./WallpaperCropper";
import { useBackToClose } from "../lib/useBackToClose";
import { useWallpaperStore, WALLPAPER_COLORS, cfgToStyle } from "../lib/wallpaper";

// scope: "default" (every chat) or a chat key like "group:<id>" (just that chat).
const WallpaperPicker = ({ scope, chatName, onClose }) => {
  const stored = useWallpaperStore((s) => (scope === "default" ? s.def : s.chats[scope]));
  const defCfg = useWallpaperStore((s) => s.def);
  const setWallpaper = useWallpaperStore((s) => s.setWallpaper);
  const clearWallpaper = useWallpaperStore((s) => s.clearWallpaper);
  const [pick, setPick] = useState(stored || null); // null = standard doodle
  const fileRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  useBackToClose(true, onClose);

  const isChat = scope !== "default";
  const same = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.value === b.value);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose a picture");
    setCropFile(file); // open the cropper so you choose exactly what to keep
  };

  const apply = () => {
    if (!pick) clearWallpaper(scope);
    else if (!setWallpaper(scope, pick)) return toast.error("That picture is too big to save on this device");
    toast.success(isChat ? "Wallpaper set for this chat" : "Wallpaper set for all chats");
    onClose();
  };

  const preview = pick ? cfgToStyle(pick) : cfgToStyle(isChat ? defCfg : null);
  const dark = pick?.kind === "color" && ["#0B141A", "#1F2C34", "#26333C", "#2B2142"].includes(pick.value);

  return (
    <>
    {cropFile && (
      <WallpaperCropper
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onDone={(dataUrl) => {
          setPick({ kind: "image", value: dataUrl });
          setCropFile(null);
        }}
      />
    )}
    <div className="fixed inset-0 z-[98] bg-black/60 flex items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm h-full sm:h-auto sm:max-h-[92vh] bg-wa-panel text-wa-text sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-5 px-4 h-14 shrink-0">
          <button onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
          <h3 className="text-[16px] truncate">{isChat ? `Wallpaper · ${chatName}` : "Default wallpaper"}</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Live preview with two sample bubbles */}
          <div className="chat-wallpaper rounded-2xl h-44 p-3 flex flex-col justify-end gap-2" style={preview}>
            <div className={`self-start max-w-[70%] rounded-lg px-3 py-1.5 text-[12px] ${dark ? "bg-[#1F2C34] text-white" : "bg-wa-panel text-wa-text"}`}>
              Hey! How does this look?
            </div>
            <div className="self-end max-w-[70%] rounded-lg px-3 py-1.5 text-[12px] bg-wa-out text-wa-text">Looks great 👍</div>
          </div>

          <p className="text-[11px] text-wa-muted mt-4 mb-2">Choose</p>
          <div className="grid grid-cols-4 gap-2.5">
            <button
              onClick={() => setPick(null)}
              className={`relative aspect-square rounded-xl chat-wallpaper border-2 text-[9.4px] flex items-end justify-center pb-1 ${
                !pick ? "border-[#21C063]" : "border-transparent"
              }`}
              style={{ backgroundImage: undefined }}
            >
              <span className="rounded px-1 bg-black/40 text-white">Doodle</span>
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={`relative aspect-square rounded-xl bg-wa-field flex flex-col items-center justify-center gap-1 text-[9.4px] text-wa-muted border-2 overflow-hidden ${
                pick?.kind === "image" ? "border-[#21C063]" : "border-transparent"
              }`}
              style={pick?.kind === "image" ? cfgToStyle(pick) : undefined}
            >
              {pick?.kind !== "image" && (
                <>
                  <ImageIcon size={22} />
                  Gallery
                </>
              )}
            </button>
            {WALLPAPER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setPick({ kind: "color", value: c })}
                className={`relative aspect-square rounded-xl border-2 flex items-center justify-center ${
                  pick?.kind === "color" && pick.value === c ? "border-[#21C063]" : "border-black/10"
                }`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              >
                {pick?.kind === "color" && pick.value === c && (
                  <Check size={20} className={dark || ["#0B141A", "#1F2C34", "#26333C", "#2B2142"].includes(c) ? "text-white" : "text-[#128C7E]"} />
                )}
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

          {isChat && stored && (
            <button
              onClick={() => {
                clearWallpaper(scope);
                toast("This chat now uses your default wallpaper");
                onClose();
              }}
              className="mt-4 text-[12.5px] text-[#F15C6D]"
            >
              Use default wallpaper for this chat
            </button>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <button onClick={apply} disabled={same(pick, stored)} className="w-full rounded-full bg-[#00A884] disabled:opacity-40 text-white py-3 text-[13.5px]">
            {isChat ? "Set for this chat" : "Set for all chats"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default WallpaperPicker;
