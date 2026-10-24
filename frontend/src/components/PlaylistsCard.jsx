import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { Music2, ChevronRight, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "./Avatar";

const PlaylistPanel = lazy(() => import("./PlaylistPanel"));

const Picker = ({ chats, onPick, onClose }) => {
  useBackToClose(true, onClose);
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-black/60 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[75vh] flex flex-col bg-wa-panel text-wa-text rounded-t-3xl lg:rounded-3xl pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-[17px] font-semibold">Shared playlist with…</h3>
          <button onClick={onClose} aria-label="Close" className="size-9 flex items-center justify-center text-wa-muted">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto pb-3">
          {chats.map((c) => (
            <button key={`${c.type}:${c.data._id}`} onClick={() => onPick({ type: c.type, data: c.data })} className="w-full flex items-center gap-3 px-5 py-2.5 active:bg-white/5 text-left">
              <Avatar src={c.pic} name={c.name} isGroup={c.type === "group"} size="size-11" textSize="text-lg" />
              <span className="text-[15.5px] truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

// One tidy row on the Updates page; tapping it lets you pick the person / group to build a song list with.
const PlaylistsCard = () => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(null); // { type, data }

  const chats = [
    ...(groups || []).map((g) => ({ type: "group", data: g, name: g.name, pic: g.groupPic })),
    ...(users || []).filter((u) => !u.isSelf).map((u) => ({ type: "direct", data: u, name: u.fullName, pic: u.profilePic })),
  ];
  if (!chats.length) return null;

  return (
    <>
      <button onClick={() => setPicking(true)} className="w-full flex items-center gap-3 px-4 py-3 mt-1 border-t border-white/5 active:bg-white/5 text-left">
        <span className="size-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[#F59E3D] to-[#F27A2A]">
          <Music2 size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-wa-text">Shared playlists</span>
          <span className="block text-[12.5px] text-wa-muted">Build a song list together with friends</span>
        </span>
        <ChevronRight size={20} className="text-wa-muted" />
      </button>
      {picking && (
        <Picker
          chats={chats}
          onClose={() => setPicking(false)}
          onPick={(chat) => {
            setPicking(false);
            setOpen(chat);
          }}
        />
      )}
      {open && (
        <Suspense fallback={null}>
          <PlaylistPanel chat={open} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </>
  );
};

export default PlaylistsCard;
