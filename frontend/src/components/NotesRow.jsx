import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";
import { useBackToClose } from "../lib/useBackToClose";

const active = (n) => !!(n?.text && n.expiresAt && new Date(n.expiresAt) > new Date());

const NoteSheet = ({ current, onClose }) => {
  useBackToClose(true, onClose);
  const [text, setText] = useState(current || "");
  const [busy, setBusy] = useState(false);
  const save = async (value) => {
    setBusy(true);
    try {
      await axiosInstance.put("/messages/note", { text: value });
      toast.success(value ? "Note shared" : "Note deleted");
      onClose();
    } catch {
      toast.error("Couldn't update your note");
      setBusy(false);
    }
  };
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-semibold">New note</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 60).replace(/\n/g, " "))}
          autoFocus
          rows={2}
          placeholder="Share what's on your mind…"
          className="w-full rounded-2xl bg-wa-field px-4 py-3 text-[15px] outline-none resize-none placeholder:text-wa-muted"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] text-wa-muted">{text.length}/60 · lasts 24 hours</span>
          {current && (
            <button onClick={() => save("")} disabled={busy} className="text-[13px] text-[#F15C6D]">
              Delete note
            </button>
          )}
        </div>
        <button onClick={() => save(text)} disabled={busy || !text.trim()} className="mt-4 w-full h-12 rounded-full bg-[#21C063] text-[#0B141A] font-semibold disabled:opacity-40">
          Share
        </button>
      </div>
    </div>,
    document.body
  );
};

// Instagram-style Notes: a strip above the chat list. Yours first, then people who have an active note.
const NotesRow = () => {
  const authUser = useAuthStore((s) => s.authUser);
  const users = useChatStore((s) => s.users);
  const setSelectedChat = useChatStore((s) => s.setSelectedChat);
  const [sheet, setSheet] = useState(false);
  if (!authUser) return null;
  const mine = active(authUser.note) ? authUser.note.text : "";
  const others = users.filter((u) => active(u.note));

  const bubble = (text, on) => (
    <span className={`absolute -top-1 left-1/2 -translate-x-1/2 max-w-[76px] px-2.5 py-1 rounded-2xl text-[11px] leading-tight text-center shadow ${on ? "bg-wa-surface text-wa-text" : "bg-wa-field text-wa-muted"}`}>
      <span className="block truncate">{text}</span>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-2 rotate-45 bg-inherit" />
    </span>
  );

  return (
    <>
      <div className="flex gap-4 overflow-x-auto no-scrollbar px-4 pt-1 pb-1">
        <button onClick={() => setSheet(true)} className="shrink-0 w-16 flex flex-col items-center gap-1 pt-6 relative" aria-label="Your note">
          {bubble(mine || "Note…", !!mine)}
          <span className="relative">
            <Avatar src={authUser.profilePic} name={authUser.fullName} size="size-14" />
            {!mine && (
              <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center ring-2 ring-wa-bg">
                <Plus size={13} strokeWidth={3} />
              </span>
            )}
          </span>
          <span className="text-[11px] text-wa-muted truncate w-full text-center">Your note</span>
        </button>
        {others.map((u) => (
          <button key={u._id} onClick={() => setSelectedChat({ type: "direct", data: u })} className="shrink-0 w-16 flex flex-col items-center gap-1 pt-6 relative">
            {bubble(u.note.text, true)}
            <Avatar src={u.profilePic} name={u.fullName} size="size-14" />
            <span className="text-[11px] text-wa-muted truncate w-full text-center">{u.fullName.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      {sheet && <NoteSheet current={mine} onClose={() => setSheet(false)} />}
    </>
  );
};

export default NotesRow;
