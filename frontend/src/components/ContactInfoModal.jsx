import { useState } from "react";
import toast from "react-hot-toast";
import { Phone, Video, Search, Star, Timer, Bell, BellOff, Ban, ChevronRight, X, ThumbsDown } from "lucide-react";
import { optimizeImage } from "../lib/cdn";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useBackToClose } from "../lib/useBackToClose";
import ImageLightbox from "./ImageLightbox";
import DisappearingPanel, { DISAPPEAR_LABELS } from "./DisappearingPanel";
import ChatStarredPanel, { useStarredCount } from "./ChatStarredPanel";
import ChatMediaPanel, { useChatMedia, MediaThumb } from "./ChatMediaPanel";

const row = "w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 border-b border-white/10";

// WhatsApp-style "Contact info" for a one-to-one chat.
const ContactInfoModal = ({ user, status, onClose }) => {
  const { setChatMuted, setUserBlocked, setChatSearchOpen } = useChatStore();
  const authUser = useAuthStore((s) => s.authUser);
  const startCall = useCallStore((s) => s.startCall);
  const callBusy = useCallStore((s) => s.callStatus !== "idle");
  const secs = useChatStore((s) => s.directDisappear[user._id] || 0);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showDisappear, setShowDisappear] = useState(false);
  const starred = useStarredCount("direct", user._id);
  const mediaData = useChatMedia("direct", user._id);
  const mediaCount = mediaData ? mediaData.media.length + mediaData.docs.length + mediaData.links.length : 0;
  useBackToClose(true, onClose);

  const chat = { type: "direct", data: user };
  const muted = (authUser?.mutedChats || []).includes(`d:${user._id}`);
  const blocked = (authUser?.blockedUsers || []).includes(user._id);

  const actions = [
    { icon: Phone, label: "Audio", run: () => { onClose(); startCall(user, "audio"); }, disabled: callBusy },
    { icon: Video, label: "Video", run: () => { onClose(); startCall(user, "video"); }, disabled: callBusy },
    { icon: Search, label: "Search", run: () => { onClose(); setTimeout(() => setChatSearchOpen(true), 50); } },
  ];

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center sm:p-4">
      <div className="bg-wa-panel text-wa-text sm:rounded-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="flex items-center gap-5 px-4 h-14 shrink-0">
          <button onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
          <h3 className="text-[16px]">Contact info</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-1 px-6 pt-2 pb-5 border-b border-white/10">
            <button
              type="button"
              onClick={() => user.profilePic && setViewPhoto(true)}
              className="size-40 rounded-full overflow-hidden bg-wa-field"
              aria-label="View profile photo"
            >
              <img src={optimizeImage(user.profilePic || "/avatar.png", 320)} alt={user.fullName} className="size-full object-cover" />
            </button>
            <h2 className="text-[22px] mt-2 text-center break-words">{user.fullName}</h2>
            <p className="text-[13px] text-wa-muted">{status}</p>
            <div className="flex gap-3 mt-4 w-full justify-center">
              {actions.map((a) => (
                <button
                  key={a.label}
                  disabled={a.disabled}
                  onClick={a.run}
                  className="flex-1 max-w-[110px] flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-white/10 hover:bg-white/5 disabled:opacity-40 text-[#25D366]"
                >
                  <a.icon size={22} />
                  <span className="text-[12px]">{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {user.about && (
            <div className="px-5 py-4 border-b border-white/10">
              <p className="text-[13.5px] break-words whitespace-pre-wrap">{user.about}</p>
              <p className="text-[11.5px] text-wa-muted mt-0.5">About</p>
            </div>
          )}

          <button onClick={() => setShowMedia(true)} className={`${row} !border-b-0`}>
            <span className="flex-1 text-[13.5px]">Media, links and docs</span>
            <span className="text-wa-muted">{mediaCount || ""}</span>
            <ChevronRight size={18} className="text-wa-muted" />
          </button>
          {mediaData?.media.length > 0 && (
            <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b border-white/10">
              {mediaData.media.slice(0, 6).map((m) => (
                <MediaThumb key={m._id} item={m} className="size-[84px] rounded-lg shrink-0" onClick={() => setShowMedia(true)} />
              ))}
            </div>
          )}

          <button onClick={() => setShowStarred(true)} className={row}>
            <Star size={22} className="text-wa-muted" />
            <span className="flex-1 text-[13.5px]">Starred messages</span>
            <span className="text-wa-muted">{starred?.length || ""}</span>
            <ChevronRight size={18} className="text-wa-muted" />
          </button>
          <button onClick={() => setChatMuted(chat, !muted)} className={row}>
            {muted ? <BellOff size={22} className="text-wa-muted" /> : <Bell size={22} className="text-wa-muted" />}
            <span className="flex-1 text-[13.5px]">Mute notifications</span>
            <span
              className={`relative w-10 h-6 rounded-full transition-colors ${muted ? "bg-[#00A884]" : "bg-wa-field"}`}
              aria-hidden="true"
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${muted ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
          <button onClick={() => setShowDisappear(true)} className={row}>
            <Timer size={22} className="text-wa-muted" />
            <span className="flex-1">
              <span className="block text-[13.5px]">Disappearing messages</span>
              <span className="block text-[11.5px] text-wa-muted">{DISAPPEAR_LABELS[secs] || "Off"}</span>
            </span>
            <ChevronRight size={18} className="text-wa-muted" />
          </button>

          <button
            onClick={async () => {
              if (!blocked && !window.confirm(`Block ${user.fullName}? They won't be able to message or call you.`)) return;
              if (await setUserBlocked(user._id, !blocked)) toast(blocked ? `${user.fullName} unblocked` : `${user.fullName} blocked`, { icon: "🚫" });
            }}
            className={`${row} text-[#F15C6D]`}
          >
            <Ban size={22} />
            <span className="flex-1 text-[13.5px]">{blocked ? "Unblock" : "Block"} {user.fullName}</span>
          </button>
          <button
            onClick={() => toast("Thanks — we'll review this contact.", { icon: "🚩" })}
            className={`${row} text-[#F15C6D] !border-b-0`}
          >
            <ThumbsDown size={22} />
            <span className="flex-1 text-[13.5px]">Report {user.fullName}</span>
          </button>
        </div>
      </div>

      {showDisappear && (
        <DisappearingPanel
          direct={{ current: secs, onPick: (s) => useChatStore.getState().setDirectDisappearing(user._id, s) }}
          onClose={() => setShowDisappear(false)}
        />
      )}
      {showStarred && (
        <ChatStarredPanel
          list={starred}
          chat={chat}
          title={user.fullName}
          onClose={() => setShowStarred(false)}
          onJump={() => {
            setShowStarred(false);
            onClose();
          }}
        />
      )}
      {showMedia && <ChatMediaPanel data={mediaData} title={user.fullName} onClose={() => setShowMedia(false)} />}
      {viewPhoto && user.profilePic && <ImageLightbox src={user.profilePic} onClose={() => setViewPhoto(false)} />}
    </div>
  );
};

export default ContactInfoModal;
