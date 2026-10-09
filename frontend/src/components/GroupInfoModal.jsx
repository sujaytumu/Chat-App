import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { X, Phone, Video, Search, UserPlus, UserMinus, LogOut, Camera, Eye, FolderOpen, Trash2, Pencil, Check, Loader2, Smile } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { compressImage } from "../lib/imageUtils";
import { useGroupCallStore } from "../store/useGroupCallStore";
import { useCallStore } from "../store/useCallStore";
import { useBackToClose } from "../lib/useBackToClose";
import ImageLightbox from "./ImageLightbox";

const GroupEmojiPhoto = lazy(() => import("./GroupEmojiPhoto"));

const GroupInfoModal = ({ group, onClose }) => {
  const { users, addMembersToGroup, removeMemberFromGroup, leaveGroup, updateGroupInfo, setChatSearchOpen } = useChatStore();
  const startGroupCall = useGroupCallStore((st) => st.startCall);
  const joinGroupCall = useGroupCallStore((st) => st.joinCall);
  const groupCallActive = useGroupCallStore((st) => !!st.states[group._id]?.active);
  const oneToOneBusy = useCallStore((st) => st.callStatus !== "idle");
  const groupBusy = useGroupCallStore((st) => st.status !== "idle");
  const callBusy = oneToOneBusy || groupBusy;
  const { authUser } = useAuthStore();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [emojiPhoto, setEmojiPhoto] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);

  // Phone Back closes this screen instead of leaving the app.
  useBackToClose(true, onClose);

  const isAdmin = group.admins.some((a) => (a._id || a) === authUser._id);
  const memberIds = new Set(group.members.map((m) => m._id || m));
  const nonMembers = users.filter((u) => !memberIds.has(u._id));

  const handleAdd = async () => {
    if (toAdd.length === 0) return;
    await addMembersToGroup(group._id, toAdd);
    setToAdd([]);
    setShowAddMembers(false);
  };

  // Close the little photo menu when tapping anywhere else.
  useEffect(() => {
    if (!photoMenu) return;
    const close = () => setPhotoMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [photoMenu]);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    setSavingPhoto(true);
    try {
      const img = await compressImage(file, { maxDimension: 800, quality: 0.85 });
      if (await updateGroupInfo(group._id, { groupPic: img })) toast.success("Group photo updated");
    } catch {
      toast.error("Couldn't use that photo");
    } finally {
      setSavingPhoto(false);
    }
  };

  const saveEmojiPhoto = async (img) => {
    setEmojiPhoto(false);
    setSavingPhoto(true);
    if (await updateGroupInfo(group._id, { groupPic: img })) toast.success("Group photo updated");
    setSavingPhoto(false);
  };

  const removePhoto = async () => {
    setPhotoMenu(false);
    setSavingPhoto(true);
    if (await updateGroupInfo(group._id, { removeGroupPic: true })) toast.success("Group photo removed");
    setSavingPhoto(false);
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === group.name) {
      setNameDraft(group.name);
      return setEditingName(false);
    }
    if (await updateGroupInfo(group._id, { name: next })) setEditingName(false);
  };

  const onAvatarClick = () => {
    if (isAdmin) setPhotoMenu((o) => !o);
    else if (group.groupPic) setViewPhoto(true);
  };

  const placeCall = (type) => {
    onClose();
    if (groupCallActive) joinGroupCall(group._id, { name: group.name, groupPic: group.groupPic });
    else startGroupCall(group, type);
  };

  const actionBtns = [
    { icon: Phone, label: "Voice", run: () => placeCall("audio"), disabled: callBusy },
    { icon: Video, label: "Video", run: () => placeCall("video"), disabled: callBusy },
    isAdmin && { icon: UserPlus, label: "Add", run: () => setShowAddMembers(true) },
    { icon: Search, label: "Search", run: () => { onClose(); setTimeout(() => setChatSearchOpen(true), 50); } },
  ].filter(Boolean);

  const handleLeave = async () => {
    if (!confirm(`Leave "${group.name}"?`)) return;
    await leaveGroup(group._id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center sm:p-4">
      <div className="bg-[#111B21] text-[#E9EDEF] sm:rounded-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="flex items-center gap-5 px-4 h-14 shrink-0">
          <button onClick={onClose} className="text-[#E9EDEF]" aria-label="Close">
            <X size={24} />
          </button>
          <h3 className="text-[19px]">Group info</h3>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-6 border-b border-white/10 relative">
          <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onAvatarClick}
              className="relative block size-40 rounded-full overflow-hidden bg-[#2A3942] group"
              aria-label={isAdmin ? "Change group photo" : "View group photo"}
            >
              {group.groupPic ? (
                <img src={group.groupPic} alt={group.name} className="size-full object-cover" />
              ) : (
                <span className="size-full flex items-center justify-center text-6xl text-[#8696A0]">
                  {group.name?.[0]?.toUpperCase()}
                </span>
              )}
              {isAdmin && (
                <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  {savingPhoto ? (
                    <Loader2 size={36} className="animate-spin text-white" />
                  ) : (
                    <Camera size={44} className="text-white" strokeWidth={1.8} />
                  )}
                </span>
              )}
            </button>

            {photoMenu && (
              <div className="absolute z-10 left-1/2 -translate-x-1/2 top-[calc(100%+6px)] w-56 rounded-2xl bg-[#233138] border border-white/10 shadow-2xl py-2">
                {[
                  group.groupPic && { icon: Eye, label: "View photo", run: () => setViewPhoto(true) },
                  { icon: Camera, label: "Take photo", run: () => cameraRef.current?.click() },
                  { icon: FolderOpen, label: "Upload photo", run: () => uploadRef.current?.click() },
                  { icon: Smile, label: "Emoji & sticker", run: () => setEmojiPhoto(true) },
                  group.groupPic && { icon: Trash2, label: "Remove photo", run: removePhoto, divider: true },
                ]
                  .filter(Boolean)
                  .map((o) => (
                    <div key={o.label}>
                      {o.divider && <div className="my-1.5 mx-4 border-t border-white/10" />}
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoMenu(false);
                          o.run();
                        }}
                        className="w-full flex items-center gap-4 px-5 py-2.5 text-left text-[15.5px] hover:bg-white/5 active:bg-white/10"
                      >
                        <o.icon size={19} className="text-[#AEBAC1]" />
                        {o.label}
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pickPhoto} />
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 w-full">
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={nameDraft}
                  maxLength={50}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setNameDraft(group.name);
                      setEditingName(false);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent border-b-2 border-[#00A884] text-[24px] text-center focus:outline-none"
                />
                <button onClick={saveName} className="text-[#00A884]" aria-label="Save name">
                  <Check size={24} />
                </button>
              </>
            ) : (
              <>
                <h4 className="text-[26px] leading-tight text-center break-words min-w-0">{group.name}</h4>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setNameDraft(group.name);
                      setEditingName(true);
                    }}
                    className="text-[#E9EDEF] shrink-0"
                    aria-label="Edit group name"
                  >
                    <Pencil size={20} />
                  </button>
                )}
              </>
            )}
          </div>
          <p className="text-[15px] text-[#8696A0]">
            Group · <span className="text-[#21C063] font-medium">{group.members.length} members</span>
          </p>
          <div className="mt-3 flex items-start justify-center gap-3">
            {actionBtns.map((b) => (
              <button
                key={b.label}
                onClick={b.run}
                disabled={b.disabled}
                className="flex flex-col items-center gap-1.5 w-[76px] disabled:opacity-40"
              >
                <span className="w-full h-11 rounded-full bg-[#2A3942] hover:bg-[#33444E] flex items-center justify-center">
                  <b.icon size={22} />
                </span>
                <span className="text-[13px]">{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-sm font-medium text-[#8696A0]">Members</span>
            {isAdmin && (
              <button
                onClick={() => setShowAddMembers((s) => !s)}
                className="btn btn-xs gap-1"
              >
                <UserPlus size={14} /> Add
              </button>
            )}
          </div>

          {showAddMembers && (
            <div className="px-4 pb-3 space-y-2 border-b border-white/10">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {nonMembers.map((u) => (
                  <label key={u._id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={toAdd.includes(u._id)}
                      onChange={() =>
                        setToAdd((prev) =>
                          prev.includes(u._id) ? prev.filter((x) => x !== u._id) : [...prev, u._id]
                        )
                      }
                    />
                    <span className="text-sm">{u.fullName}</span>
                  </label>
                ))}
                {nonMembers.length === 0 && (
                  <p className="text-xs text-[#8696A0]">Everyone is already in this group</p>
                )}
              </div>
              <button className="btn btn-xs btn-primary" onClick={handleAdd} disabled={toAdd.length === 0}>
                Add selected
              </button>
            </div>
          )}

          {group.members.map((member) => {
            const memberIsAdmin = group.admins.some((a) => (a._id || a) === member._id);
            return (
              <div key={member._id} className="flex items-center gap-3 px-4 py-2.5">
                <img
                  src={member.profilePic || "/avatar.png"}
                  alt={member._id === authUser._id ? "You" : member.fullName}
                  className="size-9 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate flex items-center gap-1">
                    {member._id === authUser._id ? "You" : member.fullName}
                    
                  </p>
                </div>
                {memberIsAdmin && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[#103529] text-[#7FE3A8] shrink-0">Group admin</span>
                )}
                {isAdmin && member._id !== authUser._id && (
                  <button
                    onClick={() => removeMemberFromGroup(group._id, member._id)}
                    className="btn btn-xs btn-ghost text-error"
                    title="Remove member"
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10">
          <button onClick={handleLeave} className="btn btn-outline btn-error btn-sm w-full gap-2">
            <LogOut size={14} /> Exit group
          </button>
        </div>
      </div>
      {emojiPhoto && (
        <Suspense fallback={null}>
          <GroupEmojiPhoto onClose={() => setEmojiPhoto(false)} onSave={saveEmojiPhoto} />
        </Suspense>
      )}
      {viewPhoto && group.groupPic && <ImageLightbox src={group.groupPic} onClose={() => setViewPhoto(false)} />}
    </div>
  );
};

export default GroupInfoModal;
