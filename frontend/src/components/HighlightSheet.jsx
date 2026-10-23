import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, Trash2, Bookmark, Lock, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { UpdateThumb } from "./HighlightsRow";
import StatusAudienceSheet, { audienceLabel } from "./StatusAudienceSheet";
import { HL_GRADIENT, HL_ACCENT, HL_ACCENT_SOFT, HL_ACCENT_TEXT, HL_SHADOW } from "../lib/highlightTheme";

const monthLabel = (iso) => new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
const dayLabel = (iso) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

// Make a highlight, add updates to one, or (editing) rename / delete it.
// You can pick from EVERYTHING you have ever posted (your archive), newest first, grouped by month.
//  statuses   - my live statuses (shown straight away while the archive loads)
//  highlights - my highlights
//  preselect  - a status id to tick at the start (opened from the viewer)
//  editing    - a highlight being edited (rename / add / delete)
const HighlightSheet = ({ statuses, highlights, preselect = null, editing = null, onClose, onSaved }) => {
  const [target, setTarget] = useState(editing ? editing._id : "new"); // "new" or a highlight id
  const [title, setTitle] = useState(editing ? editing.title : "");
  const [picked, setPicked] = useState(() => new Set(preselect ? [preselect] : []));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Who can see this highlight (everyone / everyone except… / only…). New ones start private-by-choice: the person decides.
  const [audience, setAudience] = useState(() => {
    const a = editing?.audience;
    return a?.mode ? { mode: a.mode, users: a.users || [] } : { mode: "all", users: [] };
  });
  const [audienceDirty, setAudienceDirty] = useState(false);
  const [showAudience, setShowAudience] = useState(false);

  // the archive: every status I've posted, loaded a page at a time
  const [archive, setArchive] = useState(() => [...statuses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [next, setNext] = useState(null);

  const loadPage = async (before) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/status/archive", { params: { limit: 60, ...(before ? { before } : {}) } });
      const items = res.data?.items || [];
      setArchive((prev) => {
        const seen = new Set(prev.map((s) => String(s._id)));
        return [...prev, ...items.filter((s) => !seen.has(String(s._id)))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });
      setHasMore(!!res.data?.hasMore);
      setNext(res.data?.next || null);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetHighlight = target === "new" ? null : highlights.find((h) => h._id === target) || editing;
  // updates already saved in the chosen highlight can't be picked twice
  const available = useMemo(() => {
    const have = new Set((targetHighlight?.items || []).map((it) => String(it.sourceId)));
    return archive.filter((s) => !have.has(String(s._id)));
  }, [archive, targetHighlight]);

  const groups = useMemo(() => {
    const out = [];
    for (const s of available) {
      const label = monthLabel(s.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [available]);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = available.filter((s) => picked.has(s._id)).map((s) => s._id);
  const renamed = !!editing && title.trim() && title.trim() !== editing.title;
  const canSave = !busy && (target === "new" ? chosen.length > 0 : chosen.length > 0 || renamed || (!!editing && audienceDirty));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (target === "new") {
        await axiosInstance.post("/highlights", { title: title.trim() || "Highlights", statusIds: chosen, audience });
        toast.success("Highlight created");
      } else {
        await axiosInstance.put(`/highlights/${target}`, {
          ...(renamed ? { title: title.trim() } : {}),
          ...(chosen.length ? { addStatusIds: chosen } : {}),
          ...(audienceDirty && editing ? { audience } : {}),
        });
        toast.success(editing ? "Highlight updated" : "Added to highlight");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save the highlight");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await axiosInstance.delete(`/highlights/${editing._id}`);
      toast.success("Highlight deleted");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't delete the highlight");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[170] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md lg:max-w-lg max-h-[90%] lg:max-h-[86vh] bg-wa-panel rounded-t-3xl lg:rounded-3xl flex flex-col pb-[env(safe-area-inset-bottom)] text-wa-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-3">
          <span className="size-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: HL_GRADIENT }}>
            <Bookmark size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16.5px] font-semibold leading-tight">{editing ? "Edit highlight" : "Save to highlights"}</h3>
            <p className="text-[11.5px] text-wa-muted">Pick from everything you have posted</p>
          </div>
          <button onClick={onClose} className="size-9 flex items-center justify-center text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-4 flex-1">
          {/* where to save it: a new highlight or one of mine */}
          {!editing && highlights.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
              {[{ _id: "new", title: "New highlight" }, ...highlights].map((h) => {
                const on = target === h._id;
                return (
                  <button
                    key={h._id}
                    onClick={() => setTarget(h._id)}
                    className="shrink-0 h-9 px-4 rounded-full text-[13px] font-medium border transition-colors"
                    style={on ? { background: HL_ACCENT_SOFT, color: HL_ACCENT_TEXT, borderColor: HL_ACCENT } : { borderColor: "rgb(255 255 255 / .15)", color: "rgb(var(--wa-text2))" }}
                  >
                    {h.title}
                  </button>
                );
              })}
            </div>
          )}

          {(target === "new" || editing) && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 20))}
              placeholder={editing ? "Highlight name" : "Highlight name (e.g. Trips)"}
              className="w-full h-11 rounded-xl bg-wa-field px-4 text-[14px] outline-none mb-4 text-wa-text placeholder:text-wa-muted focus:ring-2"
              style={{ "--tw-ring-color": HL_ACCENT }}
              maxLength={20}
            />
          )}

          {(target === "new" || editing) && (
            <button
              type="button"
              onClick={() => setShowAudience(true)}
              className="w-full flex items-center gap-3 rounded-xl bg-wa-field px-4 py-3 mb-4 text-left active:opacity-80"
            >
              <Lock size={18} style={{ color: HL_ACCENT }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-wa-text">Who can see this highlight</span>
                <span className="block text-[12.5px] text-wa-muted">{audience.mode === "all" ? "All my contacts" : audienceLabel(audience)}</span>
              </span>
              <ChevronRight size={18} className="text-wa-muted" />
            </button>
          )}

          {groups.length === 0 && !loading && (
            <p className="text-[13px] text-wa-muted py-8 text-center">
              {editing || target !== "new" ? "Everything you have posted is already in this highlight." : "You haven't posted any status yet. Post one, then save it here."}
            </p>
          )}

          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="text-[12.5px] font-semibold text-wa-text2 mb-2 sticky top-0 bg-wa-panel py-1 z-10">{g.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((s) => {
                  const on = picked.has(s._id);
                  return (
                    <button key={s._id} onClick={() => toggle(s._id)} className="relative aspect-[3/4] rounded-xl overflow-hidden active:scale-95 transition-transform" style={on ? { outline: `2.5px solid ${HL_ACCENT}`, outlineOffset: "-2px" } : undefined}>
                      <UpdateThumb item={s} size={240} className="size-full" />
                      <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute left-2 bottom-1.5 text-[11px] font-medium text-white drop-shadow">{dayLabel(s.createdAt)}</span>
                      {on && <span className="absolute inset-0" style={{ background: "rgb(142 92 246 / .28)" }} />}
                      <span
                        className={`absolute top-1.5 right-1.5 size-6 rounded-full flex items-center justify-center border-2 text-white ${on ? "" : "border-white/80 bg-black/25"}`}
                        style={on ? { background: HL_GRADIENT, borderColor: "transparent" } : undefined}
                      >
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin" size={22} style={{ color: HL_ACCENT }} />
            </div>
          )}
          {!loading && hasMore && (
            <button onClick={() => loadPage(next)} className="mx-auto block h-10 px-6 rounded-full text-[13px] font-medium" style={{ background: HL_ACCENT_SOFT, color: HL_ACCENT_TEXT }}>
              Show older
            </button>
          )}
          <p className="text-[11.5px] text-wa-muted mt-4">Highlights stay on your Updates page for good. People who couldn’t see an update can’t see it here either. Updates posted before this feature existed are no longer available.</p>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-white/10">
          {editing && (
            <button
              onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              disabled={busy}
              className="h-11 px-4 rounded-full text-[13px] text-[#F15C6D] flex items-center gap-1.5"
            >
              <Trash2 size={16} /> {confirmDelete ? "Tap again to delete" : "Delete"}
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave}
            className="ml-auto h-11 px-7 rounded-full text-white text-[14px] font-semibold disabled:opacity-40 flex items-center gap-2"
            style={{ background: HL_GRADIENT, boxShadow: canSave ? HL_SHADOW : "none" }}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {editing ? "Save" : chosen.length ? `Save (${chosen.length})` : "Save"}
          </button>
        </div>
      </div>
      {showAudience && (
        <div className="fixed inset-0 z-[190] wa-dark" onClick={(e) => e.stopPropagation()}>
          <StatusAudienceSheet
            noun="highlight"
            value={audience}
            onClose={() => setShowAudience(false)}
            onSave={(a) => {
              setAudience({ mode: a.mode, users: a.users || [] });
              setAudienceDirty(true);
              setShowAudience(false);
            }}
          />
        </div>
      )}
    </div>,
    document.body
  );
};

export default HighlightSheet;
