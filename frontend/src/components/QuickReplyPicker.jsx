import { useState } from "react";
import { Plus, Trash2, Zap, X } from "lucide-react";
import { getQuickReplies, saveQuickReplies } from "../lib/quickReplies";

// Shown above the message box when the text starts with "/". Tap a reply to put it in the box; "Edit" adds or removes.
const QuickReplyPicker = ({ query, onPick, onClose }) => {
  const [list, setList] = useState(getQuickReplies);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const shown = list.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const add = () => {
    if (!draft.trim()) return;
    setList(saveQuickReplies([...list, draft]));
    setDraft("");
  };

  return (
    <div className="mb-2 rounded-xl bg-wa-pop shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <Zap size={15} className="text-[#00A884]" />
        <span className="flex-1 text-[12.5px] font-medium text-wa-text">Quick replies</span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing((v) => !v)} className="text-[12px] text-[#00A884] px-1">
          {editing ? "Done" : "Edit"}
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClose} aria-label="Close" className="text-wa-muted">
          <X size={16} />
        </button>
      </div>
      {(editing ? list : shown).map((t) => (
        <div key={t} className="flex items-center">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => !editing && onPick(t)}
            className="flex-1 min-w-0 text-left px-3 py-2.5 text-[14px] text-wa-text truncate active:bg-wa-hover hover:bg-wa-hover"
          >
            {t}
          </button>
          {editing && (
            <button type="button" onClick={() => setList(saveQuickReplies(list.filter((x) => x !== t)))} aria-label="Delete" className="px-3 text-[#F15C6D]">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {!editing && shown.length === 0 && <p className="px-3 py-3 text-[13px] text-wa-muted">No quick reply matches. Tap Edit to add one.</p>}
      {editing && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New quick reply"
            maxLength={300}
            className="flex-1 min-w-0 bg-wa-field rounded-lg px-3 py-2 text-[14px] text-wa-text outline-none"
          />
          <button type="button" onClick={add} aria-label="Add" className="size-9 rounded-full bg-[#00A884] text-white flex items-center justify-center">
            <Plus size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default QuickReplyPicker;
