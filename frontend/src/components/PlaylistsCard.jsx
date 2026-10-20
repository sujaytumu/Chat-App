import { lazy, Suspense, useState } from "react";
import { Music2 } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";

const PlaylistPanel = lazy(() => import("./PlaylistPanel"));

// Shared playlists live on the Updates page: pick a person or group, then build their song list together.
const PlaylistsCard = () => {
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const [open, setOpen] = useState(null); // { type, data }

  const chats = [
    ...(groups || []).map((g) => ({ type: "group", data: g, name: g.name, pic: g.groupPic })),
    ...(users || []).filter((u) => !u.isSelf).map((u) => ({ type: "direct", data: u, name: u.fullName, pic: u.profilePic })),
  ];
  if (!chats.length) return null;

  return (
    <div className="mx-3 mt-3 rounded-2xl bg-wa-surface/60 pb-3 pt-3" style={{ boxShadow: "inset 0 0 0 1px rgb(255 255 255 / .05)" }}>
      <div className="flex items-center gap-2 px-4 pb-2">
        <span className="size-6 rounded-lg flex items-center justify-center text-white bg-[#25D366]">
          <Music2 size={13} />
        </span>
        <p className="text-[14px] font-semibold text-wa-text">Shared playlists</p>
        <p className="ml-auto text-[11.5px] text-wa-muted">Pick a chat</p>
      </div>
      <div className="flex gap-4 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {chats.map((c) => (
          <button key={`${c.type}:${c.data._id}`} onClick={() => setOpen({ type: c.type, data: c.data })} className="flex flex-col items-center gap-1 shrink-0 w-16">
            <Avatar src={c.pic} name={c.name} isGroup={c.type === "group"} size="size-14" textSize="text-xl" />
            <span className="text-[11.5px] text-wa-muted truncate w-full text-center">{c.name}</span>
          </button>
        ))}
      </div>
      {open && (
        <Suspense fallback={null}>
          <PlaylistPanel chat={open} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default PlaylistsCard;
