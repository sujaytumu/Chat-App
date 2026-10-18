import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { UpdateThumb } from "./HighlightsRow";

// Make a highlight, add updates to one, or (editing) rename / delete it.
//  statuses   - my statuses that are live right now (what can be picked)
//  highlights - my highlights
//  preselect  - a status id to tick at the start (opened from the viewer)
//  editing    - a highlight being edited (rename / add / delete)
const HighlightSheet = ({ statuses, highlights, preselect = null, editing = null, onClose, onSaved }) => {
  const [target, setTarget] = useState(editing ? editing._id : "new"); // "new" or a highlight id
  const [title, setTitle] = useState(editing ? editing.title : "");
  const [picked, setPicked] = useState(() => new Set(preselect ? [preselect] : []));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const targetHighlight = target === "new" ? null : highlights.find((h) => h._id === target) || editing;
  // statuses already saved in the chosen highlight can't be picked twice
  const available = useMemo(() => {
    const have = new Set((targetHighlight?.items || []).map((it) => String(it.sourceId)));
    return statuses.filter((s) => !have.has(String(s._id)));
  }, [statuses, targetHighlight]);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = available.filter((s) => picked.has(s._id)).map((s) => s._id);
  const renamed = !!editing && title.trim() && title.trim() !== editing.title;
  const canSave = !busy && (target === "new" ? chosen.length > 0 : chosen.length > 0 || renamed);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (target === "new") {
        await axiosInstance.post("/highlights", { title: title.trim() || "Highlights", statusIds: chosen });
        toast.success("Highlight created");
      } else {
        await axiosInstance.put(`/highlights/${target}`, {
          ...(renamed ? { title: title.trim() } : {}),
          ...(chosen.length ? { addStatusIds: chosen } : {}),
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
    <div className="wa-dark fixed inset-0 z-[170] bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-md mx-auto max-h-[88%] bg-wa-panel rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)] text-wa-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center gap-3 px-5 py-3">
          <h3 className="flex-1 text-[16px] font-medium">{editing ? "Edit highlight" : "Save to highlights"}</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-4">
          {/* where to save it: a new highlight or one of mine */}
          {!editing && highlights.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
              {[{ _id: "new", title: "New highlight" }, ...highlights].map((h) => (
                <button
                  key={h._id}
                  onClick={() => setTarget(h._id)}
                  className={`shrink-0 h-9 px-4 rounded-full text-[13px] border transition-colors ${
                    target === h._id ? "bg-wa-tint text-wa-tinttext border-transparent" : "border-white/15 text-wa-text2"
                  }`}
                >
                  {h.title}
                </button>
              ))}
            </div>
          )}

          {(target === "new" || editing) && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 20))}
              placeholder={editing ? "Highlight name" : "Highlight name (e.g. Trips)"}
              className="w-full h-11 rounded-xl bg-wa-field px-4 text-[14px] outline-none mb-3 text-wa-text placeholder:text-wa-muted"
              maxLength={20}
            />
          )}

          <p className="text-[12px] text-wa-muted mb-2">
            {available.length === 0
              ? editing
                ? "All your current status updates are already in this highlight."
                : "You have no status updates right now. Post one first, then save it here."
              : "Your updates from the last 24 hours"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {available.map((s) => {
              const on = picked.has(s._id);
              return (
                <button key={s._id} onClick={() => toggle(s._id)} className="relative aspect-[3/4] rounded-xl overflow-hidden active:scale-95 transition-transform">
                  <UpdateThumb item={s} size={240} className="size-full" />
                  {on && <span className="absolute inset-0 bg-black/35" />}
                  <span
                    className={`absolute top-1.5 right-1.5 size-6 rounded-full flex items-center justify-center border-2 ${
                      on ? "bg-[#00A884] border-[#00A884] text-white" : "border-white/80 bg-black/20 text-transparent"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] text-wa-muted mt-3">Highlights stay on your Updates page after the 24 hours are over. People who couldn’t see an update can’t see it here either.</p>
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
            className="ml-auto h-11 px-7 rounded-full bg-[#00A884] text-white text-[14px] font-medium disabled:opacity-40 flex items-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {editing ? "Save" : chosen.length ? `Save (${chosen.length})` : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default HighlightSheet;
