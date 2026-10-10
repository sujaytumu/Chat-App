import { useState } from "react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useBackToClose } from "../lib/useBackToClose";
import { translateAndToast } from "../lib/translate";
import { WaBack } from "./icons/WaIcons";
import { Reply, Star, StarOutline, Trash2, Forward, MoreVertical, Info, Copy, Pin, PinOff, Languages } from "./icons/WaGlyphs";
import ForwardMessageModal from "./ForwardMessageModal";
import MessageInfoModal from "./MessageInfoModal";

const btn = "size-11 rounded-full flex items-center justify-center text-wa-text hover:bg-white/10 active:bg-white/15 shrink-0";
const item = "w-full flex items-center gap-3 px-4 py-3 text-[13px] text-wa-text hover:bg-white/5 text-left";

// WhatsApp's top bar while messages are selected: count + Reply / Star / Delete / Forward / ⋮.
const MessageSelectionBar = () => {
  const ids = useChatStore((s) => s.selectedMsgIds);
  const messages = useChatStore((s) => s.messages);
  const selectedChat = useChatStore((s) => s.selectedChat);
  const authUser = useAuthStore((s) => s.authUser);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwarding, setForwarding] = useState(null);
  const [info, setInfo] = useState(null);

  const clear = () => useChatStore.getState().clearMsgSelection();
  useBackToClose(true, clear);

  const sel = messages.filter((m) => ids.includes(m._id));
  const single = sel.length === 1 ? sel[0] : null;
  const live = sel.filter((m) => !m.deletedForEveryone);
  const allStarred = live.length > 0 && live.every((m) => m.starredBy?.includes(authUser._id));
  const allMine = sel.length > 0 && sel.every((m) => m.senderId === authUser._id && !m.deletedForEveryone);
  const canForward = live.length > 0 && live.every((m) => !m.viewOnce && !m.poll);
  const texts = live.filter((m) => m.text).map((m) => m.text);
  const isGroup = selectedChat?.type === "group";

  const doStar = () => {
    const st = useChatStore.getState();
    live.filter((m) => !!m.starredBy?.includes(authUser._id) === allStarred).forEach((m) => st.toggleStarMessage(m._id));
    clear();
  };
  const doDelete = async (mode) => {
    const st = useChatStore.getState();
    setConfirmDelete(false);
    for (const m of sel) await st.deleteMessage(m._id, mode);
    clear();
  };

  return (
    <>
      <div className="relative z-20 flex items-center gap-1 pl-1 pr-1 lg:pl-3 py-2 bg-wa-bg lg:bg-wa-panel border-b border-white/5">
        <button onClick={clear} className={btn} aria-label="Cancel selection">
          <WaBack size={24} />
        </button>
        <span className="flex-1 text-[19px] pl-2 text-wa-text">{sel.length || ids.length}</span>
        {single && !single.deletedForEveryone && (
          <button
            className={btn}
            aria-label="Reply"
            onClick={() => {
              useChatStore.getState().setReplyingTo(single);
              clear();
            }}
          >
            <Reply size={22} />
          </button>
        )}
        {live.length > 0 && (
          <button className={btn} aria-label={allStarred ? "Unstar" : "Star"} onClick={doStar}>
            {allStarred ? <Star size={22} className="text-yellow-400" /> : <StarOutline size={22} />}
          </button>
        )}
        <button className={btn} aria-label="Delete" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={22} />
        </button>
        {canForward && (
          <button className={btn} aria-label="Forward" onClick={() => setForwarding(live)}>
            <Forward size={22} />
          </button>
        )}
        <div className="relative">
          <button className={btn} aria-label="More" onClick={() => setMenu((v) => !v)}>
            <MoreVertical size={22} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-wa-pop rounded-2xl shadow-2xl py-2 z-40 overflow-hidden">
                {single && (
                  <button
                    className={item}
                    onClick={() => {
                      setMenu(false);
                      setInfo(single);
                    }}
                  >
                    <Info size={20} className="text-wa-icon" /> Info
                  </button>
                )}
                {texts.length > 0 && (
                  <button
                    className={item}
                    onClick={() => {
                      setMenu(false);
                      navigator.clipboard.writeText(texts.join("\n")).then(
                        () => toast.success("Copied"),
                        () => toast.error("Couldn't copy")
                      );
                      clear();
                    }}
                  >
                    <Copy size={20} className="text-wa-icon" /> Copy
                  </button>
                )}
                {single && !single.deletedForEveryone && (
                  <button
                    className={item}
                    onClick={() => {
                      setMenu(false);
                      useChatStore.getState().togglePinMessage(single._id);
                      clear();
                    }}
                  >
                    {single.pinned ? <PinOff size={20} className="text-wa-icon" /> : <Pin size={20} className="text-wa-icon" />}
                    {single.pinned ? "Unpin" : "Pin"}
                  </button>
                )}
                {single?.text && (
                  <button
                    className={item}
                    onClick={() => {
                      setMenu(false);
                      translateAndToast(single.text);
                      clear();
                    }}
                  >
                    <Languages size={20} className="text-wa-icon" /> Translate
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[130] bg-black/60 flex items-center justify-center p-6" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-xs rounded-3xl bg-wa-pop p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15.5px] text-wa-text mb-4">Delete {sel.length > 1 ? `${sel.length} messages` : "message"}?</h3>
            <div className="flex flex-col items-end gap-1 text-[14px]">
              {allMine && (
                <button onClick={() => doDelete("everyone")} className="h-10 px-3 rounded-full text-[#25D366]">
                  Delete for everyone
                </button>
              )}
              <button onClick={() => doDelete("me")} className="h-10 px-3 rounded-full text-[#25D366]">
                Delete for me
              </button>
              <button onClick={() => setConfirmDelete(false)} className="h-10 px-3 rounded-full text-[#25D366]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {forwarding && (
        <ForwardMessageModal
          messages={forwarding}
          onClose={() => {
            setForwarding(null);
            clear();
          }}
        />
      )}
      {info && <MessageInfoModal message={info} members={isGroup ? selectedChat.data.members : undefined} onClose={() => setInfo(null)} />}
    </>
  );
};

export default MessageSelectionBar;
