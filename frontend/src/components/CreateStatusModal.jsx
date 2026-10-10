import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { X, Pencil, Mic, Camera, Images, Type, Image as ImageIcon, Headphones, FileText, Music, MapPin, Send, Loader2, Navigation, Palette } from "lucide-react";
import { STATUS_FONTS } from "../lib/statusFonts";
import StatusPhotoEditor from "./StatusPhotoEditor";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { compressImage } from "../lib/imageUtils";
import { readFileAsBase64, formatFileSize } from "../lib/fileUtils";
import { useBackToClose } from "../lib/useBackToClose";

const COLORS = ["#00A884", "#0B141A", "#7f66ff", "#ff8f4d", "#e91e8c", "#22c55e", "#2563eb"];
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_SONG_BYTES = 4 * 1024 * 1024;
const AUDIO_ACCEPT = "audio/*,video/mp4,video/mpeg,.mp3,.m4a,.mp4,.mpeg,.mpga,.aac,.wav,.ogg,.opus,.flac";

// Length (seconds) of a picked audio / video file.
const mediaDuration = (file, tag) =>
  new Promise((resolve) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    el.src = url;
  });

// Place suggestions around the person, from OpenStreetMap's free lookup.
async function suggestPlaces() {
  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
      : reject(new Error("no geolocation"))
  );
  const { latitude: lat, longitude: lng } = pos.coords;
  const out = [];
  const add = (name) => name && !out.some((o) => o.name === name) && out.push({ name, lat, lng });
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } }
    );
    const j = await r.json();
    const a = j.address || {};
    const area = a.suburb || a.neighbourhood || a.village || a.town || a.city_district;
    const city = a.city || a.town || a.village || a.county;
    add(j.name && j.name !== area ? `${j.name}${area ? `, ${area}` : ""}` : null);
    add(area && city ? `${area}, ${city}` : area);
    add(city && a.state ? `${city}, ${a.state}` : city);
    add(a.state && a.country ? `${a.state}, ${a.country}` : a.state);
  } catch {
    /* offline or blocked: coordinates below still work */
  }
  add(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  return out;
}

const LocationSheet = ({ onPick, onClose }) => {
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  useEffect(() => {
    suggestPlaces()
      .then(setPlaces)
      .catch(() => setError("Couldn't get your location. Allow location access, or type a place below."));
  }, []);
  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-wa-panel rounded-t-3xl pb-[env(safe-area-inset-bottom)] max-h-[75%] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center px-5 py-3">
          <h3 className="flex-1 text-[15.5px] text-wa-text">Add location</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto pb-3">
          {!places && !error && (
            <p className="flex items-center gap-2 px-5 py-4 text-wa-muted text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Finding places near you…
            </p>
          )}
          {error && <p className="px-5 py-3 text-[12px] text-wa-muted">{error}</p>}
          {places?.map((p) => (
            <button key={p.name} onClick={() => onPick(p)} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/5">
              <span className="size-10 rounded-full bg-wa-field flex items-center justify-center shrink-0">
                <Navigation size={18} className="text-[#21C063]" />
              </span>
              <span className="text-[13.5px] text-wa-text">{p.name}</span>
            </button>
          ))}
          <div className="px-5 pt-3 flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or type a place name"
              maxLength={100}
              className="flex-1 min-w-0 rounded-full bg-wa-field text-wa-text placeholder:text-wa-muted px-4 py-2.5 text-[13px] focus:outline-none"
            />
            <button
              disabled={!custom.trim()}
              onClick={() => onPick({ name: custom.trim() })}
              className="rounded-full bg-[#00A884] disabled:opacity-40 text-white px-5 text-[13px]"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateStatusModal = ({ onClose, onCreated, startWith }) => {
  const [kind, setKind] = useState("text"); // text | image | video | audio | file
  // "pick" = WhatsApp's Add status sheet (Text / Music / Voice + Camera / Gallery); "compose" = the editor
  const [step, setStep] = useState(startWith === "text" ? "compose" : "pick");
  const editorRef = useRef(null);
  const cameraRef = useRef(null);
  const voiceRef = useRef(null);
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(COLORS[0]);
  const [font, setFont] = useState(0);
  const [media, setMedia] = useState(null); // { data, url(preview), name, size, mime, duration }
  const [caption, setCaption] = useState("");
  const [song, setSong] = useState(null); // { data, name, size }
  const [place, setPlace] = useState(null); // { name, lat, lng }
  const [showPlaces, setShowPlaces] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const mediaRef = useRef(null);
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const songRef = useRef(null);
  useBackToClose(true, onClose);

  const take = async (e, as) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES && !file.type.startsWith("image/")) return toast.error("Pick a file under 10 MB");
    try {
      if (as === "media" && file.type.startsWith("image/")) {
        const data = await compressImage(file, { maxDimension: 1080, quality: 0.8 });
        setMedia({ data, url: data, name: file.name, size: file.size, mime: file.type });
        setKind("image"); setStep("compose");
      } else if (as === "media" && file.type.startsWith("video/")) {
        const duration = await mediaDuration(file, "video");
        setMedia({ data: await readFileAsBase64(file), url: URL.createObjectURL(file), name: file.name, size: file.size, mime: file.type, duration });
        setKind("video"); setStep("compose");
      } else if (as === "audio") {
        const duration = await mediaDuration(file, "audio");
        setMedia({ data: await readFileAsBase64(file), url: URL.createObjectURL(file), name: file.name, size: file.size, mime: file.type || "audio/mpeg", duration });
        setKind("audio"); setStep("compose");
      } else if (as === "file") {
        setMedia({ data: await readFileAsBase64(file), name: file.name, size: file.size, mime: file.type || "application/octet-stream" });
        setKind("file"); setStep("compose");
      } else {
        return toast.error("Choose a photo or a video");
      }
    } catch {
      toast.error("Couldn't read that file");
    }
  };

  const takeSong = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_SONG_BYTES) return toast.error("Pick a song under 4 MB");
    try {
      setSong({ data: await readFileAsBase64(file), name: file.name.replace(/\.[^.]+$/, ""), size: file.size });
    } catch {
      toast.error("Couldn't read that song");
    }
  };

  const canPost = kind === "text" ? !!text.trim() : !!media;

  const post = async () => {
    if (!canPost) return toast.error(kind === "text" ? "Write something first" : "Add a file first");
    setIsPosting(true);
    try {
      let content = kind === "text" ? text.trim() : media.data;
      if (kind === "image" && editorRef.current) content = (await editorRef.current.exportImage()) || content;
      const body = {
        type: kind,
        content,
        backgroundColor: bgColor,
        font,
        caption: kind === "text" ? "" : caption,
        ...(kind !== "text" && kind !== "image" ? { file: { name: media.name, size: media.size, mime: media.mime, duration: media.duration } } : {}),
        ...(song ? { song: { data: song.data, name: song.name, size: song.size } } : {}),
        ...(place ? { location: place } : {}),
      };
      await axiosInstance.post("/status", body);
      toast.success("Status posted");
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to post status");
    } finally {
      setIsPosting(false);
    }
  };

  const isMedia = (kind === "image" || kind === "video") && !!media;

  const tool = (Icon, label, onClick, active) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 w-14 ${active ? "text-[#21C063]" : "text-wa-icon"}`}
      aria-label={label}
    >
      <span className={`size-11 rounded-full flex items-center justify-center ${active ? "bg-[#103629]" : "bg-wa-field"}`}>
        <Icon size={20} />
      </span>
      <span className="text-[9.4px]">{label}</span>
    </button>
  );

  return createPortal(
    <div
      className={`wa-dark fixed inset-x-0 top-0 z-[150] h-[100dvh] text-wa-text flex flex-col sm:max-w-md sm:mx-auto sm:border-x sm:border-white/10 transition-colors ${kind === "text" ? "" : "bg-wa-bg"}`}
      style={kind === "text" ? { backgroundColor: bgColor } : undefined}
    >
      <div className={`${isMedia ? "hidden" : "flex"} items-center gap-2 px-2 pt-[env(safe-area-inset-top)] h-[calc(56px+env(safe-area-inset-top))] shrink-0`}>
        <button onClick={onClose} aria-label="Close" className="size-11 rounded-full flex items-center justify-center active:bg-white/15">
          <X size={24} />
        </button>
        <h3 className="text-[16px] flex-1">{kind === "text" ? "" : "Add status"}</h3>
        {kind === "text" && (
          <>
            <button
              onClick={() => setFont((f) => (f + 1) % STATUS_FONTS.length)}
              aria-label="Change font"
              className="size-11 rounded-full flex items-center justify-center active:bg-white/15 text-[20px]"
              style={{ fontFamily: STATUS_FONTS[font].css, fontWeight: STATUS_FONTS[font].weight }}
            >
              T
            </button>
            <button
              onClick={() => setBgColor((c) => COLORS[(COLORS.indexOf(c) + 1) % COLORS.length])}
              aria-label="Change background colour"
              className="size-11 rounded-full flex items-center justify-center active:bg-white/15"
            >
              <Palette size={22} />
            </button>
          </>
        )}
      </div>

      {isMedia && kind === "image" && (
        <StatusPhotoEditor
          ref={editorRef}
          src={media.url}
          onClose={onClose}
          onMusic={() => songRef.current?.click()}
          hasSong={!!song}
          onRotated={(d) => setMedia((m) => ({ ...m, url: d, data: d }))}
        />
      )}
      {isMedia && kind === "video" && (
        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
          <video src={media.url} controls playsInline className="max-w-full max-h-full" />
          <div className="absolute top-0 inset-x-0 flex items-center gap-2 px-3 pt-[calc(8px+env(safe-area-inset-top))] pb-6 bg-gradient-to-b from-black/60 to-transparent">
            <button onClick={onClose} aria-label="Close" className="size-12 rounded-full bg-black/45 text-white flex items-center justify-center text-[22px]">✕</button>
            <div className="flex-1" />
            <button onClick={() => songRef.current?.click()} aria-label="Add music" className={`size-12 rounded-full flex items-center justify-center ${song ? "bg-[#21C063] text-black" : "bg-black/45 text-white"}`}>
              <Music size={22} />
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto px-4 pb-3 ${isMedia ? "hidden" : ""}`}>
        {kind === "text" && (
          <div className="h-full min-h-[50vh] flex items-center justify-center">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a status"
              autoFocus
              maxLength={700}
              rows={Math.min(10, Math.max(2, Math.ceil(text.length / 18)))}
              className="bg-transparent text-white text-center placeholder:text-white/60 resize-none focus:outline-none w-full"
              style={{
                fontFamily: STATUS_FONTS[font].css,
                fontWeight: STATUS_FONTS[font].weight,
                fontSize: text.length > 220 ? 20 : text.length > 90 ? 26 : 34,
                lineHeight: 1.25,
              }}
            />
          </div>
        )}
        {kind === "audio" && media && (
          <div className="rounded-2xl bg-wa-field p-5 flex flex-col items-center gap-3">
            <span className="size-16 rounded-full bg-[#ff8f4d] flex items-center justify-center">
              <Headphones size={28} className="text-white" />
            </span>
            <p className="text-[13px] text-center break-all">{media.name}</p>
            <audio src={media.url} controls className="w-full" />
          </div>
        )}
        {kind === "file" && media && (
          <div className="rounded-2xl bg-wa-field p-5 flex items-center gap-4">
            <span className="size-14 rounded-xl bg-[#7f66ff] flex items-center justify-center shrink-0">
              <FileText size={26} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] break-all">{media.name}</p>
              <p className="text-[11px] text-wa-muted">{formatFileSize(media.size)}</p>
            </div>
          </div>
        )}

        {kind !== "text" && (
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption…"
            maxLength={700}
            className="mt-3 w-full rounded-full bg-wa-field text-wa-text placeholder:text-wa-muted px-4 py-3 text-[13px] focus:outline-none"
          />
        )}

        {/* Song / place chips */}
        {(song || place) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {song && (
              <span className="flex items-center gap-1.5 rounded-full bg-wa-field pl-3 pr-1.5 py-1.5 text-[11.5px] max-w-full">
                <Music size={14} className="text-[#21C063] shrink-0" />
                <span className="truncate">{song.name}</span>
                <button onClick={() => setSong(null)} className="size-5 rounded-full flex items-center justify-center text-wa-muted" aria-label="Remove song">
                  <X size={13} />
                </button>
              </span>
            )}
            {place && (
              <span className="flex items-center gap-1.5 rounded-full bg-wa-field pl-3 pr-1.5 py-1.5 text-[11.5px] max-w-full">
                <MapPin size={14} className="text-[#F15C6D] shrink-0" />
                <span className="truncate">{place.name}</span>
                <button onClick={() => setPlace(null)} className="size-5 rounded-full flex items-center justify-center text-wa-muted" aria-label="Remove location">
                  <X size={13} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {isMedia && (
        <div className="shrink-0 bg-black px-3 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))] space-y-2.5">
          {(song || place) && (
            <div className="flex flex-wrap gap-2">
              {song && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/15 pl-3 pr-1.5 py-1.5 text-[12px] text-white max-w-full">
                  <Music size={14} className="text-[#21C063] shrink-0" />
                  <span className="truncate">{song.name}</span>
                  <button onClick={() => setSong(null)} className="size-5 rounded-full flex items-center justify-center text-white/70" aria-label="Remove song"><X size={13} /></button>
                </span>
              )}
              {place && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/15 pl-3 pr-1.5 py-1.5 text-[12px] text-white max-w-full">
                  <MapPin size={14} className="text-[#F15C6D] shrink-0" />
                  <span className="truncate">{place.name}</span>
                  <button onClick={() => setPlace(null)} className="size-5 rounded-full flex items-center justify-center text-white/70" aria-label="Remove location"><X size={13} /></button>
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 h-12 rounded-full bg-[#1f2c34] px-4">
            <ImageIcon size={22} className="text-white/80 shrink-0" />
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              maxLength={700}
              className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/60 text-[15px] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="h-11 px-4 rounded-full bg-[#1f2c34] text-white text-[14px] flex items-center gap-2" onClick={() => toast("Your status goes to all your contacts")}>
              <span className="size-4 rounded-full border-2 border-white/80" /> Status (Contacts)
            </button>
            <button onClick={() => setShowPlaces(true)} aria-label="Add location" className={`size-11 rounded-full flex items-center justify-center ${place ? "bg-[#21C063] text-black" : "bg-[#1f2c34] text-white"}`}>
              <MapPin size={20} />
            </button>
            <div className="flex-1" />
            <button
              onClick={post}
              disabled={isPosting}
              className="size-14 rounded-full bg-[#21C063] disabled:opacity-60 text-black flex items-center justify-center active:scale-95"
              aria-label="Post status"
            >
              {isPosting ? <Loader2 className="animate-spin" size={22} /> : <Send size={24} />}
            </button>
          </div>
        </div>
      )}
      {/* Tools + send */}
      <div className={`${isMedia ? "hidden" : "flex"} shrink-0 px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] items-end gap-1.5 ${kind === "text" ? "bg-black/20" : "border-t border-white/10"}`}>
        <div className="flex-1 flex items-start justify-start gap-0.5 overflow-x-auto no-scrollbar">
          {tool(Type, "Text", () => setKind("text"), kind === "text")}
          {tool(ImageIcon, "Photo", () => mediaRef.current?.click(), kind === "image" || kind === "video")}
          {tool(Headphones, "Audio", () => audioRef.current?.click(), kind === "audio")}
          {tool(FileText, "File", () => fileRef.current?.click(), kind === "file")}
          {tool(Music, "Song", () => songRef.current?.click(), !!song)}
          {tool(MapPin, "Location", () => setShowPlaces(true), !!place)}
        </div>
        <button
          onClick={post}
          disabled={isPosting || !canPost}
          className="size-14 rounded-full bg-[#00A884] disabled:opacity-40 text-white flex items-center justify-center shrink-0 active:scale-95"
          aria-label="Post status"
        >
          {isPosting ? <Loader2 className="animate-spin" size={22} /> : <Send size={22} />}
        </button>
      </div>

      {step === "pick" && (
        <div className="absolute inset-0 z-10 bg-wa-bg flex flex-col rounded-t-3xl overflow-hidden">
          <div className="flex justify-center pt-3 shrink-0">
            <span className="w-10 h-1 rounded-full bg-wa-muted/50" />
          </div>
          <div className="relative flex items-center justify-center h-16 shrink-0">
            <button onClick={onClose} aria-label="Close" className="absolute left-3 size-11 rounded-full flex items-center justify-center active:bg-white/15">
              <X size={24} />
            </button>
            <h3 className="text-[18px]">Add status</h3>
          </div>
          <div className="flex gap-3 px-4 pb-4 overflow-x-auto no-scrollbar shrink-0">
            {[
              { Icon: Pencil, label: "Text", on: () => { setKind("text"); setStep("compose"); } },
              { Icon: Music, label: "Music", on: () => audioRef.current?.click() },
              { Icon: Mic, label: "Voice", on: () => voiceRef.current?.click() },
              { Icon: FileText, label: "File", on: () => fileRef.current?.click() },
              { Icon: MapPin, label: "Location", on: () => { setKind("text"); setStep("compose"); setShowPlaces(true); } },
            ].map(({ Icon, label, on }) => (
              <button key={label} onClick={on} className="flex flex-col items-center gap-2 shrink-0 w-[76px]">
                <span className="w-[76px] h-14 rounded-full bg-wa-field flex items-center justify-center">
                  <Icon size={24} />
                </span>
                <span className="text-[13px] text-wa-text2">{label}</span>
              </button>
            ))}
          </div>
          <p className="px-5 pb-2 text-[16px] text-wa-muted shrink-0">Recents</p>
          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-3 auto-rows-[33vw] sm:auto-rows-[120px] gap-px bg-wa-bg content-start">
            <button onClick={() => cameraRef.current?.click()} className="bg-wa-surface flex flex-col items-center justify-center gap-2 text-wa-text2 active:opacity-70">
              <Camera size={30} className="text-[#21C063]" />
              <span className="text-[15px]">Camera</span>
            </button>
            <button onClick={() => mediaRef.current?.click()} className="bg-wa-surface flex flex-col items-center justify-center gap-2 text-wa-text2 active:opacity-70">
              <Images size={30} className="text-[#21C063]" />
              <span className="text-[15px]">Gallery</span>
            </button>
          </div>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => take(e, "media")} />
      <input ref={voiceRef} type="file" accept="audio/*" capture className="hidden" onChange={(e) => take(e, "audio")} />
      <input ref={mediaRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => take(e, "media")} />
      <input ref={audioRef} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => take(e, "audio")} />
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => take(e, "file")} />
      <input ref={songRef} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={takeSong} />

      {showPlaces && (
        <LocationSheet
          onClose={() => setShowPlaces(false)}
          onPick={(p) => {
            setPlace(p);
            setShowPlaces(false);
          }}
        />
      )}
    </div>,
    document.body
  );
};

export default CreateStatusModal;
