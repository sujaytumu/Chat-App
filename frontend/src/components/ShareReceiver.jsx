import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Image as ImageIcon, Film, FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { compressImage } from "../lib/imageUtils";
import { MAX_FILE_SIZE_MB, formatFileSize } from "../lib/fileUtils";
import Avatar from "./Avatar";

const plugin = () => window.Capacitor?.Plugins?.TalkiesPush;

// Pull one shared file out of the phone, piece by piece, into a Blob.
const readItem = async (item) => {
  const parts = [];
  let offset = 0;
  for (let guard = 0; guard < 400; guard++) {
    const r = await plugin().readShared({ id: item.id, offset, length: 786432 });
    const bin = atob(r.data || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    parts.push(bytes);
    offset += r.read || 0;
    if (r.done || !r.read) break;
  }
  return new Blob(parts, { type: item.mime || "application/octet-stream" });
};

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(blob);
  });

// "Share to Talkies": photos, videos, files and text sent from other apps' share sheet (Google Photos, Gallery, Chrome ...)
// land here: pick a chat, and they are sent just like attachments typed in the chat.
const ShareReceiver = () => {
  const authUser = useAuthStore((s) => s.authUser);
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const [share, setShare] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const sendingRef = useRef(false);

  const pull = useCallback(async () => {
    try {
      const cur = await plugin()?.getShared?.();
      if (cur && (cur.text || cur.items?.length)) setShare((prev) => prev || cur);
    } catch {
      /* not the Android app */
    }
  }, []);

  useEffect(() => {
    if (!authUser?._id || !plugin()?.getShared) return;
    pull();
    let handle;
    try {
      const r = plugin().addListener?.("sharedContent", (data) => setShare(data));
      Promise.resolve(r).then((h) => (handle = h));
    } catch {
      /* ignore */
    }
    const vis = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      try {
        handle?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, [authUser?._id, pull]);

  const rows = useMemo(() => {
    const all = [
      ...users.map((u) => ({ key: `u:${u._id}`, type: "direct", data: u, name: u.fullName, pic: u.profilePic, at: u.lastMessage?.createdAt || 0 })),
      ...groups.map((g) => ({ key: `g:${g._id}`, type: "group", data: g, name: g.name, pic: g.groupPic, at: g.lastMessage?.createdAt || 0 })),
    ];
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => !needle || (r.name || "").toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [users, groups, q]);

  const close = async () => {
    setShare(null);
    setQ("");
    setBusy("");
    try {
      await plugin()?.clearShared?.();
    } catch {
      /* ignore */
    }
  };

  const sendTo = async (row) => {
    if (sendingRef.current || !share) return;
    sendingRef.current = true;
    const { setSelectedChat, sendMessage } = useChatStore.getState();
    try {
      setSelectedChat({ type: row.type, data: row.data });
      const items = share.items || [];
      let sent = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setBusy(`Sending ${i + 1} of ${items.length}…`);
        const isImage = (it.mime || "").startsWith("image/");
        if (!isImage && it.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error(`${it.name || "File"} is over ${MAX_FILE_SIZE_MB}MB`);
          continue;
        }
        try {
          const blob = await readItem(it);
          if (isImage) {
            let image;
            try {
              image = await compressImage(new File([blob], it.name || "photo", { type: blob.type }));
            } catch {
              image = await toDataUrl(blob);
            }
            await sendMessage({ image });
          } else {
            await sendMessage({ file: { data: await toDataUrl(blob), name: it.name || "file", mimeType: it.mime, size: it.size || blob.size } });
          }
          sent++;
        } catch {
          toast.error(`Couldn't send ${it.name || "a file"}`);
        }
      }
      if (share.text?.trim()) {
        await sendMessage({ text: share.text.trim() });
        sent++;
      }
      if (sent) toast.success(`Sent to ${row.name}`);
    } finally {
      sendingRef.current = false;
      close();
    }
  };

  if (!share || !authUser) return null;
  const items = share.items || [];
  const photos = items.filter((i) => (i.mime || "").startsWith("image/")).length;
  const videos = items.filter((i) => (i.mime || "").startsWith("video/")).length;
  const others = items.length - photos - videos;
  const bits = [photos && `${photos} photo${photos > 1 ? "s" : ""}`, videos && `${videos} video${videos > 1 ? "s" : ""}`, others && `${others} file${others > 1 ? "s" : ""}`, share.text && "text"].filter(Boolean);
  const total = items.reduce((n, i) => n + (i.size || 0), 0);

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-wa-bg text-wa-text">
      <header className="shrink-0 flex items-center gap-2 px-2 h-14 bg-wa-panel border-b border-white/5 pt-[env(safe-area-inset-top)] box-content">
        <button onClick={close} disabled={!!busy} aria-label="Cancel" className="size-10 flex items-center justify-center rounded-full active:bg-white/10 disabled:opacity-40">
          <X size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-medium leading-tight">Send to…</p>
          <p className="text-[12px] text-wa-muted leading-tight truncate">
            {bits.join(" · ")}
            {total ? ` · ${formatFileSize(total)}` : ""}
          </p>
        </div>
        <div className="flex gap-1 pr-2 text-wa-muted">
          {photos > 0 && <ImageIcon size={18} />}
          {videos > 0 && <Film size={18} />}
          {others > 0 && <FileText size={18} />}
        </div>
      </header>
      <div className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 rounded-full bg-wa-field px-4 h-11">
          <Search size={18} className="text-wa-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="flex-1 bg-transparent outline-none text-[15px]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.map((r) => (
          <button key={r.key} disabled={!!busy} onClick={() => sendTo(r)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/5 disabled:opacity-50">
            <Avatar src={r.pic} name={r.name} size="size-12" textSize="text-lg" />
            <div className="min-w-0">
              <p className="text-[16px] truncate">{r.name}</p>
              <p className="text-[12.5px] text-wa-muted">{r.type === "group" ? "Group" : "Chat"}</p>
            </div>
          </button>
        ))}
        {!rows.length && <p className="px-4 py-8 text-center text-wa-muted text-[14px]">No chats found</p>}
      </div>
      {busy && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[#00A884] text-white py-3 pb-[calc(12px+env(safe-area-inset-bottom))] text-[14px] font-medium">
          <Loader2 size={16} className="animate-spin" /> {busy}
        </div>
      )}
    </div>
  );
};

export default ShareReceiver;
