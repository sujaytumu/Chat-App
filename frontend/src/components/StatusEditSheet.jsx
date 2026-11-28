import { useState } from "react";
import { X, Loader2, MapPin, Eye, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { STATUS_FONTS } from "../lib/statusFonts";
import StatusAudienceSheet, { audienceLabel } from "./StatusAudienceSheet";
import { useBackToClose } from "../lib/useBackToClose";

const COLORS = ["#00A884", "#0B141A", "#7f66ff", "#ff8f4d", "#e91e8c", "#22c55e", "#2563eb"];

// Change a status after posting: text + look (text status) or the words under it (photo / video / audio / file),
// the place tag and who can see it. Used by the poster and by the app owner.
const StatusEditSheet = ({ status, onClose, onSaved }) => {
  useBackToClose(true, onClose); // phone Back closes this, instead of leaving the page behind it
  const isText = status.type === "text";
  const [text, setText] = useState(isText ? status.content || "" : status.caption || "");
  const [bg, setBg] = useState(status.backgroundColor || COLORS[0]);
  const [font, setFont] = useState(Number.isInteger(status.font) ? status.font : 0);
  const [place, setPlace] = useState(status.location?.name || "");
  const [audience, setAudience] = useState(status.audience || { mode: "all", users: [] });
  const [audChanged, setAudChanged] = useState(false);
  const [showAud, setShowAud] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (isText && !text.trim()) return toast.error("A text status can't be empty");
    setBusy(true);
    try {
      const body = isText ? { content: text, backgroundColor: bg, font } : { caption: text };
      const p = place.trim();
      if (p && p !== status.location?.name) body.location = { name: p };
      else if (!p && status.location?.name) body.removeLocation = true;
      if (audChanged) body.audience = audience;
      const { data } = await axiosInstance.put(`/status/${status._id}`, body, { timeout: 30000 });
      onSaved(data);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save");
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/60" onClick={busy ? undefined : onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-full max-h-[90%] flex flex-col rounded-t-3xl bg-wa-pop text-wa-text" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className="text-[18px] font-semibold">Edit status</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="size-9 flex items-center justify-center"><X size={22} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-3">
          <label className="text-[12.5px] text-wa-muted">{isText ? "Text" : "Caption"}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={700}
            rows={isText ? 5 : 3}
            placeholder={isText ? "Type a status" : "Add a caption…"}
            className="mt-1 w-full rounded-2xl px-4 py-3 text-[16px] outline-none resize-none placeholder:text-white/60"
            style={isText ? { background: bg, color: "#fff", fontFamily: STATUS_FONTS[font]?.css, fontWeight: STATUS_FONTS[font]?.weight } : { background: "var(--wa-field, rgba(255,255,255,.08))" }}
          />
          {isText && (
            <>
              <label className="block mt-3 text-[12.5px] text-wa-muted">Background</label>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label="Background colour" onClick={() => setBg(c)} className={`size-8 rounded-full border-2 ${bg === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
                ))}
              </div>
              <label className="block mt-3 text-[12.5px] text-wa-muted">Font</label>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {STATUS_FONTS.map((f, i) => (
                  <button key={f.name} type="button" onClick={() => setFont(i)} className={`px-3 h-8 rounded-full text-[13px] ${font === i ? "bg-[#21C063] text-black font-semibold" : "bg-white/10"}`}>{f.name}</button>
                ))}
              </div>
            </>
          )}

          <label className="block mt-3 text-[12.5px] text-wa-muted">Place</label>
          <div className="mt-1 flex items-center gap-2 rounded-2xl bg-wa-field px-4 h-12">
            <MapPin size={18} className="text-[#F15C6D] shrink-0" />
            <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={100} placeholder="Add a place" className="flex-1 min-w-0 bg-transparent text-[15px] outline-none" />
          </div>

          <button onClick={() => setShowAud(true)} className="mt-3 w-full h-12 rounded-2xl bg-wa-field flex items-center gap-3 px-4 text-left active:opacity-80">
            <Eye size={19} className="text-wa-icon" />
            <span className="flex-1 text-[15px]">Who can see this</span>
            <span className="text-[13.5px] text-wa-muted">{audienceLabel(audience)}</span>
            <ChevronRight size={18} className="text-wa-muted" />
          </button>
          <p className="mt-3 text-[12px] text-wa-muted">The photo, video or file itself can't be swapped. Post a new one instead. The 24 hours don't restart.</p>
        </div>
        <div className="px-5 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] shrink-0">
          <button onClick={save} disabled={busy} className="w-full h-12 rounded-full bg-[#21C063] text-black font-semibold text-[16px] disabled:opacity-60 active:scale-[.98] flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : "Save"}
          </button>
        </div>
      </div>
      {showAud && (
        <div className="fixed inset-0 z-[95]" onClick={(e) => e.stopPropagation()}>
          <StatusAudienceSheet noun="status" value={audience} onClose={() => setShowAud(false)} onSave={(a) => { setAudience(a); setAudChanged(true); setShowAud(false); }} />
        </div>
      )}
    </div>
  );
};

export default StatusEditSheet;
