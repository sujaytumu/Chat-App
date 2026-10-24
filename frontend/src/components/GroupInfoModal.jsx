import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, X, Phone, Video, Search, UserPlus, UserMinus, LogOut, Camera, Eye, FolderOpen, Trash2, Pencil, Check,
  Loader2, Smile, ChevronRight, Star, Settings, Timer, ThumbsDown, Link2, MoreVertical, QrCode, Share2, Lock,
  Heart, ListPlus, Upload, Eraser, UsersRound, Users, Bell,
} from "lucide-react";
import toast from "react-hot-toast";
import { optimizeImage } from "../lib/cdn";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useChatLockStore } from "../store/useChatLockStore";
import { exportChat } from "../lib/exportChat";
import { useGroupCallStore } from "../store/useGroupCallStore";
import { useCallStore } from "../store/useCallStore";
import { useBackToClose } from "../lib/useBackToClose";
import Avatar from "./Avatar";
import ImageLightbox from "./ImageLightbox";
import WallpaperCropper from "./WallpaperCropper";
import ReportGroupDialog from "./ReportGroupDialog";
import DisappearingPanel, { DISAPPEAR_LABELS } from "./DisappearingPanel";
import GroupPermissionsPanel from "./GroupPermissionsPanel";
import ChatStarredPanel, { useStarredCount } from "./ChatStarredPanel";
import MuteSheet from "./MuteSheet";
import CreateGroupModal from "./CreateGroupModal";
import ChatMediaPanel, { useChatMedia, MediaThumb } from "./ChatMediaPanel";

const GroupEmojiPhoto = lazy(() => import("./GroupEmojiPhoto"));
const GroupInviteSheet = lazy(() => import("./GroupInviteSheet"));
const ContactInfoModal = lazy(() => import("./ContactInfoModal"));

const TABS = ["Members", "Media", "Settings"];

// One row of the Settings lists: icon, title (+ small subtitle), optional right side.
const Row = ({ icon: Icon, title, subtitle, right, onClick, danger, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 disabled:opacity-50"
  >
    <span className={`w-7 flex justify-center shrink-0 ${danger ? "text-[#F15C6D]" : "text-wa-icon"}`}>
      <Icon size={19} />
    </span>
    <span className="flex-1 min-w-0">
      <span className={`block text-[13.5px] ${danger ? "text-[#F15C6D]" : "text-wa-text"}`}>{title}</span>
      {subtitle && <span className="block text-[12.5px] text-wa-muted mt-0.5">{subtitle}</span>}
    </span>
    {right}
  </button>
);

const Toggle = ({ on }) => (
  <span className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-[#00A884]" : "bg-wa-field border border-white/20"}`} aria-hidden="true">
    <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
  </span>
);

const GroupInfoModal = ({ group, onClose }) => {
  const { users, addMembersToGroup, removeMemberFromGroup, setGroupAdmin, leaveGroup, updateGroupInfo, setChatSearchOpen } = useChatStore();
  const startGroupCall = useGroupCallStore((st) => st.startCall);
  const joinGroupCall = useGroupCallStore((st) => st.joinCall);
  const groupCallActive = useGroupCallStore((st) => !!st.states[group._id]?.active);
  const oneToOneBusy = useCallStore((st) => st.callStatus !== "idle");
  const groupBusy = useGroupCallStore((st) => st.status !== "idle");
  const callBusy = oneToOneBusy || groupBusy;
  const { authUser } = useAuthStore();

  const [tab, setTab] = useState("Members");
  const [lastMin, setLastMin] = useState(0); // keeps the last section tall enough to reach the top
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [descDraft, setDescDraft] = useState(group.description || "");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [emojiPhoto, setEmojiPhoto] = useState(false);
  const [cropFile, setCropFile] = useState(null); // picked group photo waiting to be cropped
  const [memberSearch, setMemberSearch] = useState(null); // null = closed, string = open
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [showMedia, setShowMedia] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [memberMenu, setMemberMenu] = useState(null);
  const [memberMenuPos, setMemberMenuPos] = useState({ top: 8, right: 8, maxHeight: 320 }); // where the member ⋮ menu sits (px, fixed)
  const [viewMember, setViewMember] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showMute, setShowMute] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDisappear, setShowDisappear] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);
  const scrollRef = useRef(null);
  const tabsRef = useRef(null);
  const sectionRefs = useRef({ Members: null, Media: null, Settings: null });
  const lock = useRef(null); // while a tap-initiated scroll runs, the tab stays on the one tapped

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setLastMin(Math.max(0, el.clientHeight - (tabsRef.current?.offsetHeight || 44)));
    measure();
    const ro = window.ResizeObserver ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Phone Back closes this screen instead of leaving the app.
  useBackToClose(true, onClose);

  const starred = useStarredCount("group", group._id);
  const mediaData = useChatMedia("group", group._id);
  const mediaCount = mediaData ? mediaData.media.length + mediaData.docs.length + mediaData.links.length : 0;

  const chat = { type: "group", data: group };
  const key = `g:${group._id}`;
  const isAdmin = group.admins.some((a) => (a._id || a) === authUser._id);
  const perms = { editInfo: "admins", addMembers: "admins", sendMessages: "all", ...(group.permissions || {}) };
  const canEdit = isAdmin || perms.editInfo === "all";
  const canAddMembers = isAdmin || perms.addMembers === "all";
  const muted = (authUser.mutedChats || []).includes(key);
  const locked = (authUser.lockedChats || []).includes(key);
  const lists = authUser.chatLists || [];
  const isFav = !!lists.find((l) => l.id === "favourites")?.chats?.includes(key);
  const customLists = lists.filter((l) => l.id !== "favourites");
  const memberIds = new Set(group.members.map((m) => m._id || m));
  const nonMembers = users.filter((u) => !memberIds.has(u._id));

  const shownMembers = group.members.filter(
    (m) => memberSearch == null || (m.fullName || "").toLowerCase().includes(memberSearch.trim().toLowerCase())
  );

  // ---- actions ----
  const placeCall = (type) => {
    onClose();
    if (groupCallActive) joinGroupCall(group._id, { name: group.name, groupPic: group.groupPic });
    else startGroupCall(group, type);
  };
  // Member options (same as WhatsApp): message / call / view for everyone, admin tools for admins.
  const memberUser = (member) => users.find((u) => u._id === member._id) || member;
  const messageMember = (member) => {
    setMemberMenu(null);
    onClose();
    useChatStore.getState().setSelectedChat({ type: "direct", data: memberUser(member) });
  };
  const callMember = (member, type) => {
    setMemberMenu(null);
    if (callBusy) {
      toast.error("You're already on a call");
      return;
    }
    onClose();
    setTimeout(() => useCallStore.getState().startCall(memberUser(member), type), 150);
  };
  const handleAdd = async () => {
    if (toAdd.length === 0) return;
    await addMembersToGroup(group._id, toAdd);
    setToAdd([]);
    setShowAddMembers(false);
  };
  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    setCropFile(file); // crop first, then save
  };
  const saveCroppedPhoto = async (img) => {
    setCropFile(null);
    setSavingPhoto(true);
    try {
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
    setSavingPhoto(true);
    if (await updateGroupInfo(group._id, { removeGroupPic: true })) toast.success("Group photo removed");
    setSavingPhoto(false);
  };
  const saveEdits = async () => {
    const payload = {};
    if (nameDraft.trim() && nameDraft.trim() !== group.name) payload.name = nameDraft.trim();
    if (descDraft.trim() !== (group.description || "")) payload.description = descDraft;
    if (Object.keys(payload).length && !(await updateGroupInfo(group._id, payload))) return;
    setEditMode(false);
  };
  const toggleFavourite = async () => {
    const fav = lists.find((l) => l.id === "favourites") || { id: "favourites", name: "Favourites", chats: [] };
    const chats = isFav ? fav.chats.filter((k) => k !== key) : [...new Set([...fav.chats, key])];
    const next = [...lists.filter((l) => l.id !== "favourites"), { ...fav, chats }];
    if (await useChatStore.getState().setChatLists(next)) toast(isFav ? "Removed from Favourites" : "Added to Favourites", { icon: "💚" });
  };
  const toggleInList = async (list) => {
    const has = list.chats.includes(key);
    const next = lists.map((l) => (l.id === list.id ? { ...l, chats: has ? l.chats.filter((k) => k !== key) : [...l.chats, key] } : l));
    await useChatStore.getState().setChatLists(next);
  };
  const toggleLock = () => {
    const { requestLock, requestRemoveLock } = useChatLockStore.getState();
    if (locked) requestRemoveLock(chat);
    else
      requestLock(chat, () => {
        onClose();
        useChatStore.getState().setSelectedChat(null);
      });
  };
  const handleClear = async () => {
    if (!confirm(`Clear all messages in "${group.name}"? Starred messages will be kept.`)) return;
    if (await useChatStore.getState().clearChat(chat, true)) toast.success("Chat cleared");
  };
  const handleLeave = async () => {
    if (!confirm(`Exit "${group.name}"?`)) return;
    await leaveGroup(group._id);
    onClose();
  };
  const goSearch = () => {
    onClose();
    setTimeout(() => setChatSearchOpen(true), 50);
  };

  // One scrolling page: Members, Media and Settings sit one under the other. The green tab follows
  // whichever section is at the top, and tapping a tab scrolls to its section (like WhatsApp).
  const tabsHeight = () => tabsRef.current?.offsetHeight || 44;
  const syncTab = () => {
    const el = scrollRef.current;
    if (!el || lock.current) return;
    const line = el.getBoundingClientRect().top + tabsHeight() + 24;
    let cur = TABS[0];
    for (const t of TABS) {
      const sec = sectionRefs.current[t];
      if (sec && sec.getBoundingClientRect().top <= line) cur = t;
    }
    setTab(cur);
  };
  const onScroll = (e) => {
    setScrolled(e.currentTarget.scrollTop > 180);
    syncTab();
  };
  const goTab = (t) => {
    const el = scrollRef.current;
    const sec = sectionRefs.current[t];
    setTab(t);
    if (!el || !sec) return;
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - tabsHeight();
    clearTimeout(lock.current);
    lock.current = setTimeout(() => {
      lock.current = null;
      syncTab();
    }, 800);
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };
  const onTouchStartScroll = (e) => {
    e.stopPropagation(); // keep the app's own tab-swipe out of this screen
    if (lock.current) {
      clearTimeout(lock.current); // finger back on the page: it decides the tab again
      lock.current = null;
    }
  };
  const actionBtns = [
    { icon: Phone, label: "Voice", run: () => placeCall("audio"), disabled: callBusy },
    { icon: Video, label: "Video", run: () => placeCall("video"), disabled: callBusy },
    isAdmin
      ? { icon: Share2, label: "Share", run: () => setShowInvite(true) }
      : canAddMembers && { icon: UserPlus, label: "Add", run: () => { goTab("Members"); setShowAddMembers(true); } },
    { icon: Search, label: "Search", run: goSearch },
  ].filter(Boolean);

  const iconBtn = "size-10 rounded-full flex items-center justify-center text-wa-text hover:bg-white/10 active:bg-white/15 shrink-0";

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center sm:p-4">
      <div className="bg-wa-bg text-wa-text sm:rounded-2xl w-full sm:max-w-md h-full sm:h-[92vh] flex flex-col shadow-xl overflow-hidden relative">
        {/* Top bar: back · (compact avatar + name once scrolled) · QR · ⋮ */}
        <div className="flex items-center gap-1 px-2 h-12 shrink-0 bg-wa-bg z-10">
          <button onClick={editMode ? () => setEditMode(false) : onClose} className={iconBtn} aria-label={editMode ? "Cancel editing" : "Back"}>
            {editMode ? <X size={21} /> : <ArrowLeft size={21} />}
          </button>
          {editMode ? (
            <h3 className="flex-1 text-[15.5px] pl-2">Group info</h3>
          ) : scrolled ? (
            <div className="flex-1 flex items-center gap-3 min-w-0 pl-1">
              <Avatar src={group.groupPic} name={group.name} isGroup size="size-9" />
              <span className="text-[15.5px] truncate">{group.name}</span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {!editMode && isAdmin && (
            <button onClick={() => setShowInvite(true)} className={iconBtn} aria-label="Group QR code and link">
              <QrCode size={21} />
            </button>
          )}
          {!editMode && (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} className={iconBtn} aria-label="More options">
                <MoreVertical size={21} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-2xl bg-wa-pop border border-white/10 shadow-2xl py-2 z-40">
                    {[
                      canEdit && { label: "Edit group", icon: Pencil, run: () => { setNameDraft(group.name); setDescDraft(group.description || ""); setEditMode(true); } },
                      { label: "Search in chat", icon: Search, run: goSearch },
                      { label: "Starred messages", icon: Star, run: () => setShowStarred(true) },
                    ]
                      .filter(Boolean)
                      .map((o) => (
                        <button
                          key={o.label}
                          onClick={() => {
                            setMenu(false);
                            o.run();
                          }}
                          className="w-full flex items-center gap-4 px-5 py-3 text-left text-[13.5px] hover:bg-white/5"
                        >
                          <o.icon size={19} className="text-wa-icon" /> {o.label}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div ref={scrollRef} onScroll={onScroll} onTouchStart={onTouchStartScroll} onTouchEnd={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} className="flex-1 overflow-y-auto overscroll-contain">
          {/* Header block */}
          <div className="flex flex-col items-center px-5 pt-0 pb-4">
            <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => (editMode || canEdit ? setPhotoMenu((o) => !o) : group.groupPic && setViewPhoto(true))}
                className={`relative block overflow-hidden bg-wa-field ${group.groupPic ? "rounded-[28px]" : "size-[128px] rounded-full"}`}
                aria-label={editMode || canEdit ? "Change group photo" : "View group photo"}
              >
                {group.groupPic ? (
                  <img src={optimizeImage(group.groupPic, 720)} decoding="async" alt={group.name} className="block max-h-[230px] w-auto max-w-[min(86vw,340px)] min-h-[128px] object-cover" />
                ) : (
                  <span className="size-full flex items-center justify-center text-7xl text-wa-muted">
                    <UsersRound size={60} />
                  </span>
                )}
                {editMode && (
                  <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
                    {savingPhoto ? <Loader2 size={30} className="animate-spin text-white" /> : <Camera size={32} className="text-white" strokeWidth={1.8} />}
                  </span>
                )}
              </button>
              {!editMode && canEdit && (
                <span className="absolute right-0 bottom-0 size-8 rounded-full bg-[#21C063] text-[#0B141A] border-2 border-wa-bg flex items-center justify-center pointer-events-none">
                  {savingPhoto ? <Loader2 size={15} className="animate-spin" /> : <Camera size={16} />}
                </span>
              )}
              {photoMenu && (editMode || canEdit) && <div className="fixed inset-0 z-[5]" onClick={() => setPhotoMenu(false)} />}
              {photoMenu && (editMode || canEdit) && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-[calc(100%+6px)] w-56 rounded-2xl bg-wa-pop border border-white/10 shadow-2xl py-2">
                  {[
                    group.groupPic && { icon: Eye, label: "View photo", run: () => setViewPhoto(true) },
                    { icon: Camera, label: "Take photo", run: () => cameraRef.current?.click() },
                    { icon: FolderOpen, label: "Upload photo", run: () => uploadRef.current?.click() },
                    { icon: Smile, label: "Emoji & sticker", run: () => setEmojiPhoto(true) },
                    group.groupPic && { icon: Trash2, label: "Remove photo", run: removePhoto },
                  ]
                    .filter(Boolean)
                    .map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => {
                          setPhotoMenu(false);
                          o.run();
                        }}
                        className="w-full flex items-center gap-4 px-5 py-2.5 text-left text-[12.5px] hover:bg-white/5 active:bg-white/10"
                      >
                        <o.icon size={19} className="text-wa-icon" /> {o.label}
                      </button>
                    ))}
                </div>
              )}
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
              <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pickPhoto} />
            </div>

            {editMode ? (
              <div className="w-full mt-5 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    autoFocus
                    value={nameDraft}
                    maxLength={50}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent border-b-2 border-[#00A884] text-[18px] text-center focus:outline-none pb-1"
                    aria-label="Group name"
                  />
                  <button onClick={saveEdits} className="text-[#21C063] shrink-0" aria-label="Save">
                    <Check size={28} />
                  </button>
                </div>
                <textarea
                  value={descDraft}
                  maxLength={512}
                  rows={3}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Add group description"
                  className="w-full rounded-xl bg-wa-field px-4 py-3 text-[13.5px] focus:outline-none resize-none"
                  aria-label="Group description"
                />
              </div>
            ) : (
              <>
                <h4 className="mt-3 text-[22px] font-medium tracking-tight leading-tight text-center break-words max-w-full">{group.name}</h4>
                <p className="mt-1 text-[13.5px] text-wa-muted">
                  Group · {group.members.length} member{group.members.length === 1 ? "" : "s"}
                </p>
                {group.description ? (
                  <p className="mt-3 text-[14.5px] leading-snug text-wa-muted text-center whitespace-pre-wrap break-words max-w-full">{group.description}</p>
                ) : (
                  canEdit && (
                    <button
                      onClick={() => {
                        setNameDraft(group.name);
                        setDescDraft("");
                        setEditMode(true);
                      }}
                      className="mt-3 text-[13.5px] text-[#21C063]"
                    >
                      Add group description
                    </button>
                  )
                )}
                <div className="mt-4 flex items-start justify-center gap-2.5 w-full">
                  {actionBtns.map((b) => (
                    <button key={b.label} onClick={b.run} disabled={b.disabled} className="flex flex-col items-center gap-1.5 flex-1 max-w-[80px] disabled:opacity-40">
                      <span className="w-full h-10 rounded-2xl bg-wa-field hover:bg-wa-hover active:bg-wa-hover flex items-center justify-center">
                        <b.icon size={19} />
                      </span>
                      <span className="text-[12.5px]">{b.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Tabs (stick to the top while scrolling) */}
          <div ref={tabsRef} className="sticky top-0 z-[5] bg-wa-bg border-y border-white/10 flex relative">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => goTab(t)}
                className={`flex-1 py-2.5 text-[13.5px] transition-colors duration-200 ${tab === t ? "text-wa-text" : "text-wa-muted"}`}
              >
                {t}
              </button>
            ))}
            <span
              className="absolute bottom-0 h-[3px] w-10 rounded-full bg-[#21C063] transition-[left] duration-300 ease-out"
              style={{ left: `calc(${((TABS.indexOf(tab) + 0.5) / TABS.length) * 100}% - 20px)` }}
            />
          </div>

          <div>
          {/* ---- Members ---- */}
            <div ref={(n) => (sectionRefs.current.Members = n)} className="pb-6">
              <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                {memberSearch == null ? (
                  <>
                    <span className="text-[13.5px] text-wa-muted">
                      {group.members.length} member{group.members.length === 1 ? "" : "s"}
                    </span>
                    <button onClick={() => setMemberSearch("")} className="text-wa-muted p-1" aria-label="Search members">
                      <Search size={19} />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 w-full bg-wa-field rounded-full px-4 h-10">
                    <Search size={18} className="text-wa-muted shrink-0" />
                    <input
                      autoFocus
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members"
                      className="flex-1 bg-transparent outline-none text-[13.5px]"
                    />
                    <button onClick={() => setMemberSearch(null)} aria-label="Close search">
                      <X size={18} className="text-wa-muted" />
                    </button>
                  </div>
                )}
              </div>

              {canAddMembers && memberSearch == null && (
                <button onClick={() => setShowAddMembers((s) => !s)} className="w-full flex items-center gap-3.5 px-4 py-2 text-left hover:bg-white/5">
                  <span className="size-10 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center shrink-0">
                    <UserPlus size={19} />
                  </span>
                  <span className="text-[14.5px]">Add members</span>
                </button>
              )}

              {showAddMembers && (
                <div className="mx-5 mb-2 p-3 rounded-2xl bg-wa-panel space-y-2">
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {nonMembers.map((u) => (
                      <label key={u._id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={toAdd.includes(u._id)}
                          onChange={() => setToAdd((prev) => (prev.includes(u._id) ? prev.filter((x) => x !== u._id) : [...prev, u._id]))}
                        />
                        <Avatar src={u.profilePic} name={u.fullName} size="size-8" textSize="text-sm" />
                        <span className="text-[13.5px]">{u.fullName}</span>
                      </label>
                    ))}
                    {nonMembers.length === 0 && <p className="text-xs text-wa-muted">Everyone is already in this group</p>}
                  </div>
                  <button className="btn btn-sm btn-primary w-full" onClick={handleAdd} disabled={toAdd.length === 0}>
                    Add selected
                  </button>
                </div>
              )}

              {shownMembers.map((member) => {
                const isYou = member._id === authUser._id;
                const memberIsAdmin = group.admins.some((a) => (a._id || a) === member._id);
                return (
                  <div key={member._id} className="flex items-center gap-3.5 px-4 py-2">
                    <Avatar src={member.profilePic} name={member.fullName} size="size-[42px]" textSize="text-base" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] truncate">{isYou ? "You" : member.fullName}</p>
                      {member.about && <p className="text-[12.5px] text-wa-muted truncate">{member.about}</p>}
                    </div>
                    {memberIsAdmin && (
                      <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-wa-tint text-wa-tinttext shrink-0 border border-[#21C063]/30">Group Admin</span>
                    )}
                    {isYou && <div className="w-8 shrink-0" aria-hidden="true" />}
                    {!isYou && (
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            // Place the menu where it fits: below the button if there is room, else above,
                            // else pinned inside the screen (scrolls if the screen is very short).
                            const r = e.currentTarget.getBoundingClientRect();
                            const vh = window.innerHeight;
                            const items = isAdmin ? 6 : 4;
                            const h = items * 40 + 16;
                            const below = vh - r.bottom - 8;
                            const above = r.top - 8;
                            const right = Math.max(8, window.innerWidth - r.right);
                            let pos;
                            if (h <= below) pos = { top: r.bottom + 4, right };
                            else if (h <= above) pos = { top: r.top - h - 4, right };
                            else pos = { top: Math.max(8, Math.min(r.bottom + 4, vh - h - 8)), right };
                            setMemberMenuPos({ ...pos, maxHeight: vh - 16 });
                            setMemberMenu((m) => (m === member._id ? null : member._id));
                          }}
                          className="p-1.5 text-wa-muted"
                          title="Member options"
                          aria-label={`Options for ${member.fullName}`}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {memberMenu === member._id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setMemberMenu(null)} />
                            <div style={memberMenuPos} className="fixed z-40 w-52 overflow-y-auto bg-wa-pop rounded-2xl shadow-2xl border border-white/10 py-2">
                              <button className="w-full text-left px-4 py-2.5 text-[13.5px] hover:bg-white/5 truncate" onClick={() => messageMember(member)}>
                                Message {member.fullName}
                              </button>
                              <button className="w-full text-left px-4 py-2.5 text-[13.5px] hover:bg-white/5 truncate" onClick={() => callMember(member, "audio")}>
                                Voice call {member.fullName}
                              </button>
                              <button className="w-full text-left px-4 py-2.5 text-[13.5px] hover:bg-white/5 truncate" onClick={() => callMember(member, "video")}>
                                Video call {member.fullName}
                              </button>
                              <button
                                className="w-full text-left px-4 py-2.5 text-[13.5px] hover:bg-white/5 truncate"
                                onClick={() => {
                                  setMemberMenu(null);
                                  setViewMember(memberUser(member));
                                }}
                              >
                                View {member.fullName}
                              </button>
                              {isAdmin && (
                                <>
                              <button
                                className="w-full text-left px-4 py-2.5 text-[13.5px] hover:bg-white/5"
                                onClick={() => {
                                  setMemberMenu(null);
                                  setGroupAdmin(group._id, member._id, !memberIsAdmin);
                                }}
                              >
                                {memberIsAdmin ? "Dismiss as admin" : "Make group admin"}
                              </button>
                              <button
                                className="w-full text-left px-4 py-2.5 text-[13.5px] text-[#F15C6D] hover:bg-white/5 flex items-center gap-2"
                                onClick={() => {
                                  setMemberMenu(null);
                                  confirm(`Remove ${member.fullName} from the group?`) && removeMemberFromGroup(group._id, member._id);
                                }}
                              >
                                <UserMinus size={18} /> Remove from group
                              </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {shownMembers.length === 0 && <p className="text-center text-wa-muted text-sm py-6">No members found</p>}
            </div>

          {/* ---- Media ---- */}
            <div ref={(n) => (sectionRefs.current.Media = n)} className="pb-8 border-t border-white/10">
              <button onClick={() => setShowMedia(true)} className="w-full flex items-center justify-between px-5 pt-4 pb-3 text-left">
                <span className="text-[14.5px]">Media, links and docs</span>
                <span className="flex items-center gap-1 text-wa-muted text-[13.5px]">
                  {mediaCount} <ChevronRight size={18} />
                </span>
              </button>
              {mediaData?.media.length > 0 ? (
                <div className="flex gap-2 px-5 pb-4 overflow-x-auto">
                  {mediaData.media.slice(0, 8).map((m) => (
                    <MediaThumb key={m._id} item={m} className="size-[108px] rounded-xl shrink-0" onClick={() => setShowMedia(true)} />
                  ))}
                </div>
              ) : (
                <p className="px-5 pb-4 text-[12.5px] text-wa-muted">No media shared yet</p>
              )}
              <div className="border-t border-white/10 mt-1">
                <Row icon={Star} title="Starred messages" right={<span className="flex items-center gap-1 text-wa-muted">{starred?.length || ""}<ChevronRight size={18} /></span>} onClick={() => setShowStarred(true)} />
              </div>

              <p className="px-5 pt-5 pb-1 text-[13.5px] text-wa-muted">Settings</p>
              <Row icon={Settings} title="Group permissions" onClick={() => setShowPerms(true)} />
              <Row
                icon={Bell}
                title="Notifications"
                subtitle={muted ? "Muted" : "All"}
                onClick={() => (muted ? useChatStore.getState().setChatMuted(chat, false) : setShowMute(true))}
              />
              <Row
                icon={Timer}
                title="Disappearing messages"
                subtitle={DISAPPEAR_LABELS[group.disappearAfter || 0] || "On"}
                onClick={() => setShowDisappear(true)}
              />
              <Row icon={Lock} title="Chat lock" subtitle="Lock and hide this chat on this device" right={<Toggle on={locked} />} onClick={toggleLock} />
              {isAdmin && <Row icon={Link2} title="Invite to group via link" onClick={() => setShowInvite(true)} />}
            </div>

          {/* ---- Settings ---- */}
            <div ref={(n) => (sectionRefs.current.Settings = n)} className="pb-8 pt-2 border-t border-white/10" style={{ minHeight: lastMin }}>
              <Row icon={Users} title="Create a similar group" subtitle="Start with the same members that you can add or remove." onClick={() => setShowSimilar(true)} />
              <div className="border-t border-white/10 my-1" />
              <Row icon={Heart} title={isFav ? "Remove from Favourites" : "Add to Favourites"} onClick={toggleFavourite} />
              <Row icon={ListPlus} title="Add to list" onClick={() => setShowLists(true)} />
              <Row icon={Upload} title="Export chat" onClick={() => exportChat(chat, { myId: authUser._id, myName: authUser.fullName })} />
              <Row icon={Eraser} title="Clear chat" danger onClick={handleClear} />
              <div className="border-t border-white/10 my-1" />
              <Row icon={LogOut} title="Exit group" danger onClick={handleLeave} />
              <Row icon={ThumbsDown} title="Report group" danger onClick={() => setShowReport(true)} />
            </div>
          </div>
        </div>
      </div>

      {/* Add to list sheet */}
      {showLists && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowLists(false)}>
          <div className="w-full sm:max-w-sm bg-wa-pop rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14.5px] mb-3">Add to list</h3>
            {customLists.length === 0 ? (
              <p className="text-sm text-wa-muted py-3">You don&apos;t have any lists yet. Create one from the chat list (Chats → + next to the filters).</p>
            ) : (
              customLists.map((l) => (
                <button key={l.id} onClick={() => toggleInList(l)} className="w-full flex items-center gap-4 py-3 text-left">
                  <span className={`size-6 rounded-md border flex items-center justify-center ${l.chats.includes(key) ? "bg-[#00A884] border-[#00A884]" : "border-white/30"}`}>
                    {l.chats.includes(key) && <Check size={16} className="text-white" />}
                  </span>
                  <span className="text-[14px]">{l.name}</span>
                </button>
              ))
            )}
            <div className="flex justify-end mt-3">
              <button onClick={() => setShowLists(false)} className="px-4 h-10 rounded-full text-[#21C063] font-medium">Done</button>
            </div>
          </div>
        </div>
      )}

      {showSimilar && (
        <CreateGroupModal
          initialMemberIds={group.members.map((m) => m._id || m).filter((id) => id !== authUser._id)}
          onClose={() => setShowSimilar(false)}
          onCreated={() => {
            setShowSimilar(false);
            onClose();
          }}
        />
      )}
      {showReport && (
        <ReportGroupDialog
          group={group}
          onClose={() => setShowReport(false)}
          onReportedAndExit={async () => {
            await leaveGroup(group._id);
            onClose();
          }}
        />
      )}
      {showDisappear && <DisappearingPanel group={group} isAdmin={isAdmin} onClose={() => setShowDisappear(false)} />}
      {showMute && (
        <MuteSheet
          name={group.name}
          onClose={() => setShowMute(false)}
          onPick={(until) => {
            setShowMute(false);
            useChatStore.getState().setChatMuted(chat, true, { until });
          }}
        />
      )}
      {showInvite && (
        <Suspense fallback={null}>
          <GroupInviteSheet group={group} onClose={() => setShowInvite(false)} />
        </Suspense>
      )}
      {showPerms && <GroupPermissionsPanel group={group} isAdmin={isAdmin} onClose={() => setShowPerms(false)} />}
      {showStarred && (
        <ChatStarredPanel
          list={starred}
          chat={chat}
          title={group.name}
          onClose={() => setShowStarred(false)}
          onJump={() => {
            setShowStarred(false);
            onClose();
          }}
        />
      )}
      {showMedia && <ChatMediaPanel data={mediaData} title={group.name} onClose={() => setShowMedia(false)} />}
      {emojiPhoto && (
        <Suspense fallback={null}>
          <GroupEmojiPhoto onClose={() => setEmojiPhoto(false)} onSave={saveEmojiPhoto} />
        </Suspense>
      )}
      {cropFile && (
        <WallpaperCropper
          file={cropFile}
          title="Crop group photo"
          aspectRatio={1}
          lockLabel="Square"
          initialLocked={false}
          maxSize={1200}
          variant="whatsapp"
          hint="Drag the frame to move it, drag a corner to resize. Only what's inside becomes the group photo."
          onCancel={() => setCropFile(null)}
          onDone={saveCroppedPhoto}
        />
      )}
      {viewPhoto && group.groupPic && <ImageLightbox src={group.groupPic} onClose={() => setViewPhoto(false)} />}
      {viewMember && (
        <Suspense fallback={null}>
          <ContactInfoModal user={viewMember} status={viewMember.about || ""} onClose={() => setViewMember(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default GroupInfoModal;
