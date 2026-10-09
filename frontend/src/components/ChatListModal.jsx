import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Avatar from "./Avatar";
import { WaBack, WaCheck } from "./icons/WaIcons";

// Create / edit a chat list (Favourites or a custom list): pick a name and tick
// the chats that belong in it.
const ChatListModal = ({ title, initialName = "", nameEditable = true, candidates, initialKeys = [], onSave, onDelete, onClose }) => {
  const [name, setName] = useState(initialName);
  const [picked, setPicked] = useState(() => new Set(initialKeys));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return candidates.filter((c) => c.name.toLowerCase().includes(t));
  }, [candidates, q]);

  const toggle = (key) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const canSave = name.trim().length > 0 && !busy;
  const save = async () => {
    setBusy(true);
    const ok = await onSave(name.trim(), [...picked]);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-stretch lg:items-center justify-center lg:p-4" onClick={onClose}>
      <div
        className="bg-wa-bg w-full lg:max-w-md lg:rounded-2xl lg:max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center h-14 pl-1 pr-3 shrink-0">
          <button onClick={onClose} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Back">
            <WaBack size={24} />
          </button>
          <h2 className="flex-1 text-[20px] text-wa-text pl-3">{title}</h2>
          <button
            onClick={save}
            disabled={!canSave}
            className="h-9 px-4 rounded-full bg-[#21C063] text-wa-bg text-[15px] font-medium disabled:opacity-40"
          >
            Save
          </button>
        </div>

        {nameEditable && (
          <div className="px-4 pb-3 shrink-0">
            <input
              autoFocus
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name (e.g. Family, Work)"
              className="w-full h-12 rounded-xl bg-wa-surface px-4 text-[16px] text-wa-text placeholder:text-wa-muted focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
            />
          </div>
        )}

        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-3 h-11 rounded-full bg-wa-surface px-4">
            <Search size={18} className="text-wa-muted shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none"
            />
          </div>
        </div>
        <p className="px-4 pb-1 text-[13px] text-wa-muted shrink-0">
          {picked.size} chat{picked.size === 1 ? "" : "s"} selected
        </p>

        <div className="flex-1 overflow-y-auto pb-2">
          {shown.length === 0 && <p className="text-center text-wa-muted py-8 text-[15px]">No chats found</p>}
          {shown.map((c) => {
            const on = picked.has(c.key);
            return (
              <button key={c.key} onClick={() => toggle(c.key)} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-wa-surface hover:bg-wa-surface/70">
                <Avatar src={c.avatar} name={c.name} size="size-11" textSize="text-base" />
                <span className="flex-1 min-w-0 truncate text-[16px] text-wa-text">{c.name}</span>
                <span
                  className={`size-6 rounded-md border-2 flex items-center justify-center ${
                    on ? "bg-[#21C063] border-[#21C063] text-wa-bg" : "border-wa-muted2"
                  }`}
                >
                  {on && <WaCheck size={16} />}
                </span>
              </button>
            );
          })}
        </div>

        {onDelete && (
          <button
            onClick={async () => {
              if (await onDelete()) onClose();
            }}
            className="shrink-0 h-12 text-[15px] text-red-400 border-t border-white/5 active:bg-white/5"
          >
            Delete list
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatListModal;
