import { useEffect, useState } from "react";
import { X, Megaphone, Plus, Trash2, Pencil, Send, ArrowLeft, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";

const MAX_TEXT = 2000;

// Broadcast lists: save a set of contacts and send one message to all of them.
// Every recipient gets it as a normal one-to-one message (they can't see who else got it).
const BroadcastModal = ({ onClose }) => {
  const users = useChatStore((s) => s.users);
  const [view, setView] = useState("lists"); // lists | edit | send
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const load = async () => {
    try {
      const res = await axiosInstance.get("/broadcasts");
      setLists(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Couldn't load your broadcast lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const userById = (id) => users.find((u) => u._id === id);
  const members = (list) => (list?.memberIds || []).map(userById).filter(Boolean);

  const openEdit = (list) => {
    setActive(list || null);
    setName(list?.name || "");
    setSelectedIds(list ? list.memberIds.filter((id) => userById(id)) : []);
    setView("edit");
  };

  const toggle = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!name.trim()) return toast.error("Give the list a name");
    if (!selectedIds.length) return toast.error("Pick at least one contact");
    setBusy(true);
    try {
      if (active) await axiosInstance.put(`/broadcasts/${active._id}`, { name: name.trim(), memberIds: selectedIds });
      else await axiosInstance.post("/broadcasts", { name: name.trim(), memberIds: selectedIds });
      await load();
      setView("lists");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't save the list");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (list) => {
    if (!window.confirm(`Delete "${list.name}"?`)) return;
    try {
      await axiosInstance.delete(`/broadcasts/${list._id}`);
      setLists((prev) => prev.filter((l) => l._id !== list._id));
    } catch {
      toast.error("Couldn't delete the list");
    }
  };

  // Sends through the normal one-to-one endpoint, a few at a time, so blocking,
  // delivery ticks, push notifications etc. all behave exactly like a typed message.
  const send = async () => {
    const message = text.trim().slice(0, MAX_TEXT);
    const targets = members(active);
    if (!message || !targets.length) return;
    setBusy(true);
    setProgress({ done: 0, failed: 0, total: targets.length });
    let next = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (next < targets.length) {
        const user = targets[next++];
        try {
          await axiosInstance.post(`/messages/send/${user._id}`, { text: message });
          done++;
        } catch {
          failed++;
        }
        setProgress({ done, failed, total: targets.length });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBusy(false);
    try {
      useChatStore.getState().getUsers();
    } catch {
      /* ignore */
    }
    if (failed === 0) {
      toast.success(`Sent to ${done} contact${done !== 1 ? "s" : ""}`);
      onClose();
    } else {
      toast.error(`Sent to ${done}, couldn't reach ${failed}`);
      setProgress(null);
    }
  };

  const title = view === "edit" ? (active ? "Edit list" : "New broadcast list") : view === "send" ? active?.name : "Broadcast lists";

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={busy ? undefined : onClose}>
      <div
        className="bg-wa-panel text-wa-text rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[92dvh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-16 shrink-0">
          <h3 className="text-[17px] font-medium flex items-center gap-3 min-w-0">
            {view === "lists" ? (
              <Megaphone size={22} className="text-wa-muted shrink-0" />
            ) : (
              <button disabled={busy} onClick={() => setView("lists")} aria-label="Back" className="text-wa-icon shrink-0">
                <ArrowLeft size={22} />
              </button>
            )}
            <span className="truncate">{title}</span>
          </h3>
          <button
            disabled={busy}
            onClick={onClose}
            className="size-11 rounded-full flex items-center justify-center text-wa-icon hover:bg-white/10 active:bg-white/15"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {view === "lists" && (
          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            <button onClick={() => openEdit(null)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-wa-surface/70 text-left">
              <span className="size-12 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                <Plus size={24} className="text-[#0b141a]" />
              </span>
              <span className="text-[15px]">New list</span>
            </button>
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-wa-muted" size={24} />
              </div>
            )}
            {!loading && lists.length === 0 && (
              <p className="px-6 py-8 text-center text-[13px] leading-snug text-wa-muted">
                Send one message to many people at once. Each person gets it as a normal chat and can&apos;t see who else received it.
              </p>
            )}
            {lists.map((list) => (
              <div key={list._id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-wa-surface/70">
                <button
                  className="flex-1 min-w-0 flex items-center gap-4 text-left"
                  onClick={() => {
                    setActive(list);
                    setText("");
                    setProgress(null);
                    setView("send");
                  }}
                >
                  <span className="size-12 rounded-full bg-wa-pop flex items-center justify-center shrink-0">
                    <Megaphone size={20} className="text-wa-muted" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] truncate">{list.name}</span>
                    <span className="block text-[12.5px] text-wa-muted truncate">
                      {members(list).map((u) => u.fullName).join(", ") || `${list.memberIds.length} contacts`}
                    </span>
                  </span>
                </button>
                <button onClick={() => openEdit(list)} className="size-10 rounded-full flex items-center justify-center text-wa-icon hover:bg-white/10" aria-label="Edit">
                  <Pencil size={18} />
                </button>
                <button onClick={() => remove(list)} className="size-10 rounded-full flex items-center justify-center text-red-400 hover:bg-white/10" aria-label="Delete">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {view === "edit" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pb-3 shrink-0">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="List name"
                maxLength={50}
                autoFocus
                className="w-full bg-transparent border-0 border-b-2 border-wa-field focus:border-[#25D366] focus:outline-none focus:ring-0 text-[15.5px] text-wa-text placeholder:text-wa-muted py-2 transition-colors"
              />
              <p className="text-[11px] text-[#25D366] mt-3 font-medium">
                {selectedIds.length === 0 ? "Pick contacts" : `${selectedIds.length} contact${selectedIds.length !== 1 ? "s" : ""} selected`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {users.map((user) => {
                const checked = selectedIds.includes(user._id);
                return (
                  <button type="button" key={user._id} onClick={() => toggle(user._id)} className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-wa-surface/70 text-left">
                    <Avatar src={user.profilePic} name={user.fullName} size="size-12" />
                    <span className="flex-1 min-w-0 text-[14.5px] truncate">{user.fullName}</span>
                    <span className={`size-6 rounded-full border-2 flex items-center justify-center ${checked ? "bg-[#25D366] border-[#25D366]" : "border-wa-field"}`}>
                      {checked && <Check size={14} className="text-[#0b141a]" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-4 shrink-0">
              <button
                onClick={save}
                disabled={busy || !name.trim() || !selectedIds.length}
                className="w-full h-12 rounded-full bg-[#25D366] text-[#0b141a] font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="animate-spin" size={20} /> : "Save list"}
              </button>
            </div>
          </div>
        )}

        {view === "send" && active && (
          <div className="flex flex-col flex-1 min-h-0">
            <p className="px-4 pb-2 text-[12.5px] text-wa-muted shrink-0">
              To {members(active).length} contact{members(active).length !== 1 ? "s" : ""}: {members(active).map((u) => u.fullName).join(", ")}
            </p>
            <div className="px-4 pb-3 flex-1 min-h-0">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message"
                maxLength={MAX_TEXT}
                rows={5}
                autoFocus
                disabled={busy}
                className="w-full resize-none bg-wa-pop rounded-2xl px-4 py-3 text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none"
              />
              {progress && (
                <p className="text-[12.5px] text-wa-muted mt-2">
                  Sending… {progress.done + progress.failed} of {progress.total}
                </p>
              )}
            </div>
            <div className="p-4 shrink-0">
              <button
                onClick={send}
                disabled={busy || !text.trim() || members(active).length === 0}
                className="w-full h-12 rounded-full bg-[#25D366] text-[#0b141a] font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="animate-spin" size={20} /> : (<><Send size={18} /> Send</>)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BroadcastModal;
