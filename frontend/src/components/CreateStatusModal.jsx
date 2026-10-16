import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { X, Camera, Images, Type, Image as ImageIcon, Headphones, FileText, Music, MapPin, Send, Loader2, Navigation, Palette } from "lucide-react";
import { STATUS_FONTS } from "../lib/statusFonts";
import StatusPhotoEditor from "./StatusPhotoEditor";
import StatusMusicSheet from "./StatusMusicSheet";
import StatusAudienceSheet, { readAudience, audienceLabel, AUDIENCE_KEY } from "./StatusAudienceSheet";
import StatusVideoPreview, { MAX_STATUS_VIDEO_SECONDS } from "./StatusVideoPreview";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { compressImage } from "../lib/imageUtils";
import { readFileAsBase64, formatFileSize } from "../lib/fileUtils";
import { useBackToClose } from "../lib/useBackToClose";
import { useStatusBarColor } from "../lib/useStatusBarColor";

// Filled icons (Material Design Icons, Apache 2.0) so this screen looks like WhatsApp's.
const Mdi = ({ d, size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);
const D_EDIT = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const D_NOTE = "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";
const D_MIC = "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z";
const D_SEND = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
const D_COLLECTIONS = "M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z";
const D_ADD_PHOTO = "M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z";
const StatusRing = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.2" />
  </svg>
);

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
  const [trim, setTrim] = useState(null); // video longer than 90 s: { start, end } seconds
  const [caption, setCaption] = useState("");
  const [song, setSong] = useState(null); // { data, name, size }
  const [place, setPlace] = useState(null); // { name, lat, lng }
  const [showPlaces, setShowPlaces] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [audience, setAudience] = useState(readAudience);
  const [showAudience, setShowAudience] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [editorMode, setEditorMode] = useState(null); // null | draw | text | sticker (photo editor)
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
        setTrim(duration > MAX_STATUS_VIDEO_SECONDS ? { start: 0, end: MAX_STATUS_VIDEO_SECONDS } : null);
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
      setShowMusic(false);
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
      if (kind === "image" && editorRef.current) {
        try {
          content = (await editorRef.current.exportImage()) || content;
        } catch {
          /* send the original photo if flattening fails */
        }
      }
      const body = {
        type: kind,
        content,
        backgroundColor: bgColor,
        font,
        caption: kind === "text" ? "" : caption,
        ...(kind !== "text" && kind !== "image" ? { file: { name: media.name, size: media.size, mime: media.mime, duration: media.duration } } : {}),
        ...(kind === "video" && trim ? { trim } : {}),
        ...(song ? { song: { data: song.data, name: song.name, size: song.size, mime: song.mime } } : {}),
        ...(place ? { location: place } : {}),
        ...(audience.mode !== "all" ? { audience } : {}),
      };
      await axiosInstance.post("/status", body, { timeout: 180000 });
      toast.success("Status posted");
      onCreated();
      onClose();
    } catch (error) {
      const st = error.response?.status;
      toast.error(
        error.response?.data?.error ||
          (st === 413 ? "That file is too large for a status" : st ? `Couldn't post status (error ${st})` : "Couldn't reach the server — check your connection and try again")
      );
    } finally {
      setIsPosting(false);
    }
  };

  const isMedia = (kind === "image" || kind === "video") && !!media;

  // Status bar follows the screen: black in the photo editor, the sheet's shade on "Add status".
  const barColor = step === "pick" ? "#0B0D0F" : kind === "text" ? bgColor : isMedia ? "#000000" : "#0B141A";
  useStatusBarColor(barColor, true);

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
          onMusic={() => setShowMusic(true)}
          hasSong={!!song}
          onRotated={(d) => setMedia((m) => ({ ...m, url: d, data: d }))}
          onLocation={() => setShowPlaces(true)}
          onModeChange={setEditorMode}
        />
      )}
      {isMedia && kind === "video" && (
        <StatusVideoPreview src={media.url} duration={media.duration} trim={trim} onTrimChange={setTrim}>
          <div className="absolute top-0 inset-x-0 flex items-center gap-1.5 px-3.5 pt-[calc(14px+env(safe-area-inset-top))] pb-3">
            <button onClick={onClose} aria-label="Close" className="size-10 rounded-full bg-[#101418] text-white flex items-center justify-center text-[18px]">✕</button>
            <div className="flex-1" />
            <button onClick={() => setShowMusic(true)} aria-label="Add music" className={`size-10 rounded-full flex items-center justify-center ${song ? "bg-[#21C063] text-black" : "bg-[#101418] text-white"}`}>
              <Mdi d={D_NOTE} size={19} />
            </button>
          </div>
        </StatusVideoPreview>
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

      {isMedia && !(kind === "image" && editorMode) && (
        <div className={`${kind === "image" ? "absolute bottom-0 inset-x-0 z-[5]" : "shrink-0"} bg-black`}>
          <div className="pt-3" />
          {(song || place) && (
            <div className="flex flex-wrap gap-2 px-4 pb-2.5">
              {song && (
                <span className="flex items-center gap-1.5 text-[13px] text-white max-w-full">
                  <Music size={18} className="text-[#21C063] shrink-0" />
                  <span className="truncate">{song.name}</span>
                  <button onClick={() => setSong(null)} className="size-6 flex items-center justify-center text-white/70" aria-label="Remove song"><X size={16} /></button>
                </span>
              )}
              {place && (
                <span className="flex items-center gap-1.5 text-[13px] text-white max-w-full">
                  <MapPin size={18} className="text-[#F15C6D] shrink-0" />
                  <span className="truncate">{place.name}</span>
                  <button onClick={() => setPlace(null)} className="size-6 flex items-center justify-center text-white/70" aria-label="Remove location"><X size={16} /></button>
                </span>
              )}
            </div>
          )}
          <div className="mx-2.5 mb-2 flex items-center gap-3 h-[44px] rounded-full bg-[#101418] pl-4 pr-4">
            <Mdi d={D_ADD_PHOTO} size={22} className="text-white shrink-0" />
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              maxLength={700}
              className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/60 text-[14.5px] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 bg-[#0A0E11] px-2.5 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
            <button className="h-9 pl-3 pr-3.5 rounded-full bg-[#101418] text-white/90 text-[13px] flex items-center gap-1.5" onClick={() => setShowAudience(true)}>
              <StatusRing size={18} /> Status ({audienceLabel(audience)})
            </button>
            <div className="flex-1" />
            <button
              onClick={post}
              disabled={isPosting}
              className="size-12 rounded-full bg-[#21C063] disabled:opacity-60 text-[#0B141A] flex items-center justify-center active:scale-95"
              aria-label="Post status"
            >
              {isPosting ? <Loader2 className="animate-spin" size={22} /> : <Mdi d={D_SEND} size={22} />}
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
        <div className="absolute inset-0 z-10 bg-[#0B0D0F]">
          <div className="relative h-full flex flex-col rounded-t-[24px] bg-[#161A1D] overflow-hidden">
            <div className="flex justify-center pt-3 shrink-0">
              <span className="w-9 h-1 rounded-full bg-[#4A5258]" />
            </div>
            <div className="relative flex items-center justify-center h-[56px] shrink-0">
              <button onClick={onClose} aria-label="Close" className="absolute left-2 size-10 rounded-full flex items-center justify-center text-white active:bg-white/15">
                <X size={22} />
              </button>
              <h3 className="text-[18px] font-medium tracking-tight text-[#E9EDEF]">Add status</h3>
            </div>
            <div className="flex gap-4 px-5 pt-1 pb-4 overflow-x-auto no-scrollbar shrink-0">
              {[
                { icon: <Mdi d={D_EDIT} size={20} />, label: "Text", on: () => { setKind("text"); setStep("compose"); } },
                { icon: <Mdi d={D_NOTE} size={20} />, label: "Music", on: () => audioRef.current?.click() },
                { icon: <Mdi d={D_MIC} size={20} />, label: "Voice", on: () => voiceRef.current?.click() },
                { icon: <FileText size={19} />, label: "File", on: () => fileRef.current?.click() },
              ].map(({ icon, label, on }) => (
                <button key={label} onClick={on} className="flex flex-col items-center gap-1.5 shrink-0 w-[60px] text-white">
                  <span className="w-[60px] h-[44px] rounded-full bg-[#262A2E] flex items-center justify-center active:bg-[#30363b]">{icon}</span>
                  <span className="text-[12px] text-[#C5CDD2]">{label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => mediaRef.current?.click()} className="flex items-center gap-2 px-5 pt-2 pb-3 text-[14px] text-[#8E9AA2] self-start shrink-0">
              Recents
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 6h20L12 19z" /></svg>
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-4 auto-rows-[25vw] sm:auto-rows-[100px] gap-[2px] bg-[#0B0D0F] content-start pb-24">
              <button onClick={() => cameraRef.current?.click()} className="bg-[#1A1E21] flex flex-col items-center justify-center gap-2 text-[#8E9AA2] active:opacity-70">
                <Camera size={24} className="text-[#21C063]" />
                <span className="text-[12px]">Camera</span>
              </button>
              <button onClick={() => mediaRef.current?.click()} className="bg-[#1A1E21] flex flex-col items-center justify-center gap-2 text-[#8E9AA2] active:opacity-70">
                <Images size={24} className="text-[#21C063]" />
                <span className="text-[12px]">Gallery</span>
              </button>
            </div>
            <button
              onClick={() => mediaRef.current?.click()}
              aria-label="Browse all photos and videos"
              className="absolute right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] size-12 rounded-2xl bg-[#232A2F] text-white flex items-center justify-center shadow-lg active:bg-[#2d353b]"
            >
              <Mdi d={D_COLLECTIONS} size={22} />
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

      {showAudience && (
        <StatusAudienceSheet
          value={audience}
          onClose={() => setShowAudience(false)}
          onSave={(a) => {
            setAudience(a);
            try {
              localStorage.setItem(AUDIENCE_KEY, JSON.stringify(a));
            } catch {
              /* private mode */
            }
            setShowAudience(false);
          }}
        />
      )}

      {showMusic && (
        <StatusMusicSheet
          onClose={() => setShowMusic(false)}
          onPick={(s) => {
            setSong(s);
            setShowMusic(false);
          }}
          onFiles={() => songRef.current?.click()}
        />
      )}

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
