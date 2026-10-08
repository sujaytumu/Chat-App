import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Camera, ExternalLink, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import SettingsShell, { ToggleRow } from "../components/SettingsShell";
import Avatar from "../components/Avatar";
import { InstallAppControl } from "./SettingsPage";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { axiosInstance } from "../lib/axios";
import { compressImage } from "../lib/imageUtils";
import { clearChatCache } from "../lib/chatCache";
import { checkForUpdateNow, currentBuildId } from "../lib/versionCheck";
import { getReduceMotion, setReduceMotion, getHaptics, setHaptics } from "../lib/uiSettings";
import { formatChatListTime } from "../lib/utils";

const card = "rounded-xl bg-[#1F2C34] p-4";
const label = "text-[13px] text-[#8696A0] mb-1.5";
const field =
  "w-full h-11 rounded-lg bg-[#0B141A] border border-[#2A3942] px-3 text-[16px] text-[#E9EDEF] placeholder:text-[#667781] focus:outline-none focus:border-[#25D366]";
const primaryBtn =
  "h-11 px-5 rounded-full bg-[#25D366] text-[#0B141A] font-semibold text-[15px] disabled:opacity-40 active:scale-[.98] transition";
const ghostBtn = "h-11 px-5 rounded-full border border-[#2A3942] text-[#E9EDEF] text-[15px] hover:bg-white/5 active:bg-white/10 disabled:opacity-40";

/* ---------------- Account: photo, name, about, email, password ---------------- */
export const AccountPage = () => {
  const { authUser, updateProfile, isUpdatingProfile } = useAuthStore();
  const [name, setName] = useState(authUser?.fullName || "");
  const [about, setAbout] = useState(authUser?.about || "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const dirty = name.trim() !== (authUser?.fullName || "") || about.trim() !== (authUser?.about || "");

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    try {
      await updateProfile({ profilePic: await compressImage(file, { maxDimension: 800, quality: 0.85 }) });
    } catch {
      toast.error("Could not process image");
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    setSavingPw(true);
    try {
      await axiosInstance.put("/auth/change-password", { currentPassword: cur, newPassword: next });
      toast.success("Password changed");
      setCur("");
      setNext("");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not change password");
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <SettingsShell title="Account">
      <div className="flex justify-center pt-2">
        <label className="relative cursor-pointer">
          <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-[110px]" textSize="text-5xl" />
          <span className="absolute bottom-0 right-0 size-10 rounded-full bg-[#21C063] text-[#0B141A] flex items-center justify-center ring-4 ring-[#0B141A]">
            {isUpdatingProfile ? <Loader2 className="animate-spin" size={18} /> : <Camera size={20} />}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={isUpdatingProfile} />
        </label>
      </div>

      <div className={card}>
        <p className={label}>Name</p>
        <input className={field} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
        <p className={`${label} mt-4`}>About</p>
        <input className={field} value={about} maxLength={139} placeholder="Say something about yourself" onChange={(e) => setAbout(e.target.value)} />
        <p className="text-[12px] text-[#667781] mt-1.5 text-right">{about.length}/139</p>
        <div className="flex justify-end mt-2">
          <button
            className={primaryBtn}
            disabled={!dirty || !name.trim() || isUpdatingProfile}
            onClick={() => updateProfile({ fullName: name, about })}
          >
            Save
          </button>
        </div>
      </div>

      <div className={card}>
        <p className={label}>Email</p>
        <p className="text-[16px] text-[#E9EDEF] break-all">{authUser?.email}</p>
        <p className={`${label} mt-4`}>Member since</p>
        <p className="text-[16px] text-[#E9EDEF]">
          {authUser?.createdAt ? new Date(authUser.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}
        </p>
      </div>

      <form onSubmit={changePw} className={card}>
        <p className="text-[16px] text-[#E9EDEF] mb-3">Change password</p>
        <input className={`${field} mb-3`} type="password" autoComplete="current-password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <input className={field} type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} />
        <div className="flex justify-end mt-3">
          <button type="submit" className={primaryBtn} disabled={!cur || !next || savingPw}>
            {savingPw ? <Loader2 className="animate-spin" size={18} /> : "Update"}
          </button>
        </div>
      </form>
    </SettingsShell>
  );
};

/* ---------------- Starred messages ---------------- */
export const StarredPage = () => {
  const navigate = useNavigate();
  const { authUser } = useAuthStore();
  const { users, groups, jumpToMessage } = useChatStore();
  const [list, setList] = useState(null);

  useEffect(() => {
    let live = true;
    axiosInstance
      .get("/messages/starred/all")
      .then((r) => live && setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      (list || []).map((m) => {
        let chat = null;
        let name = "";
        let pic = "";
        if (m.groupId) {
          const g = groups.find((x) => x._id === (m.groupId._id || m.groupId));
          if (g) {
            chat = { type: "group", data: g };
            name = g.name;
            pic = g.groupPic;
          }
        } else {
          const mineSent = (m.senderId?._id || m.senderId) === authUser?._id;
          const other = mineSent ? m.receiverId : m.senderId;
          const u = users.find((x) => x._id === (other?._id || other));
          if (u) {
            chat = { type: "direct", data: u };
            name = u.fullName;
            pic = u.profilePic;
          }
        }
        const body = m.text || (m.image ? "📷 Photo" : m.file ? `📎 ${m.file.name || "File"}` : m.audio ? "🎤 Voice message" : "Message");
        return { m, chat, name, pic, body, mine: (m.senderId?._id || m.senderId) === authUser?._id };
      }),
    [list, users, groups, authUser]
  );

  return (
    <SettingsShell title="Starred messages">
      {list === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#25D366]" size={28} /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-[#8696A0] py-10 text-[15px]">No starred messages yet.<br />Long-press a message and tap Star to keep it here.</p>
      ) : (
        <div className="-mx-4">
          {rows.map(({ m, chat, name, pic, body, mine }) => (
            <button
              key={m._id}
              disabled={!chat}
              onClick={() => {
                navigate("/");
                setTimeout(() => jumpToMessage(chat, m._id), 120);
              }}
              className="w-full flex items-start gap-3 pl-3 pr-4 py-3 text-left hover:bg-white/5 active:bg-[#1F2C34] disabled:opacity-60"
            >
              <Avatar src={pic} name={name} isGroup={!!m.groupId} size="size-12" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] text-[#E9EDEF] truncate">{name || "Chat"}</span>
                  <span className="text-xs text-[#8696A0] shrink-0">{formatChatListTime(m.createdAt)}</span>
                </span>
                <span className="block text-[14.5px] text-[#8696A0] line-clamp-2">{mine ? "You: " : ""}{body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </SettingsShell>
  );
};

/* ---------------- Chats: archive / unarchive everything ---------------- */
export const ChatsSettingsPage = () => {
  const { authUser } = useAuthStore();
  const { users, groups, setChatArchived } = useChatStore();
  const [busy, setBusy] = useState(false);
  const archived = useMemo(() => new Set(authUser?.archivedChats || []), [authUser]);

  const all = useMemo(
    () => [...users.map((u) => ({ type: "direct", data: u, k: `d:${u._id}` })), ...groups.map((g) => ({ type: "group", data: g, k: `g:${g._id}` }))],
    [users, groups]
  );
  const toArchive = all.filter((c) => !archived.has(c.k));
  const toRestore = all.filter((c) => archived.has(c.k));

  const run = async (targets, archive) => {
    setBusy(true);
    const res = await Promise.all(targets.map((c) => setChatArchived({ type: c.type, data: c.data }, archive, { silent: true })));
    setBusy(false);
    if (res.every(Boolean)) toast(archive ? `${targets.length} chats archived` : `${targets.length} chats unarchived`);
  };

  return (
    <SettingsShell title="Chats">
      <div className={card}>
        <p className="text-[16px] text-[#E9EDEF]">Archive all chats</p>
        <p className="text-[13.5px] text-[#8696A0] mt-0.5">Move every chat into Archived. You can bring them back any time.</p>
        <div className="flex justify-end mt-3">
          <button className={ghostBtn} disabled={busy || toArchive.length === 0} onClick={() => run(toArchive, true)}>
            Archive {toArchive.length}
          </button>
        </div>
      </div>
      <div className={card}>
        <p className="text-[16px] text-[#E9EDEF]">Unarchive all chats</p>
        <p className="text-[13.5px] text-[#8696A0] mt-0.5">Return everything in Archived to your chat list.</p>
        <div className="flex justify-end mt-3">
          <button className={ghostBtn} disabled={busy || toRestore.length === 0} onClick={() => run(toRestore, false)}>
            Unarchive {toRestore.length}
          </button>
        </div>
      </div>
    </SettingsShell>
  );
};

/* ---------------- Storage and data ---------------- */
const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const StoragePage = () => {
  const [usage, setUsage] = useState(null);
  const [clearing, setClearing] = useState(false);

  const measure = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      setUsage(est?.usage ?? 0);
    } catch {
      setUsage(0);
    }
  };
  useEffect(() => {
    measure();
  }, []);

  const clear = async () => {
    setClearing(true);
    try {
      clearChatCache();
      if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      toast.success("Cache cleared");
    } catch {
      toast.error("Could not clear the cache");
    } finally {
      setClearing(false);
      measure();
    }
  };

  return (
    <SettingsShell title="Storage and data">
      <div className={card}>
        <p className={label}>Stored on this device</p>
        <p className="text-[26px] text-[#E9EDEF]">{usage === null ? "…" : fmtBytes(usage)}</p>
        <p className="text-[13.5px] text-[#8696A0] mt-1">Saved app files and your last-seen chat list, so Talkies opens fast. Your messages stay on the server.</p>
        <div className="flex justify-end mt-3">
          <button className={ghostBtn} onClick={clear} disabled={clearing}>
            {clearing ? <Loader2 className="animate-spin" size={18} /> : "Clear cache"}
          </button>
        </div>
      </div>
    </SettingsShell>
  );
};

/* ---------------- Accessibility ---------------- */
export const AccessibilityPage = () => {
  const [motion, setMotion] = useState(getReduceMotion());
  const [haptics, setHap] = useState(getHaptics());
  return (
    <SettingsShell title="Accessibility">
      <ToggleRow title="Reduce motion" sub="Turn off animations and transitions" checked={motion} onChange={(v) => { setMotion(v); setReduceMotion(v); }} />
      <ToggleRow title="Vibration" sub="Vibrate when you long-press a chat" checked={haptics} onChange={(v) => { setHap(v); setHaptics(v); }} />
    </SettingsShell>
  );
};

/* ---------------- Help and feedback ---------------- */
export const HelpPage = () => {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    const r = await checkForUpdateNow();
    setChecking(false);
    if (r === "latest") toast.success("You're on the latest version");
    else if (r === "unknown") toast.error("Couldn't check right now");
  };
  return (
    <SettingsShell title="Help and feedback">
      <div className={card}>
        <p className={label}>App version</p>
        <p className="text-[16px] text-[#E9EDEF] font-mono">{currentBuildId()}</p>
        <div className="flex justify-end mt-3">
          <button className={ghostBtn} onClick={check} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" size={18} /> : (<span className="flex items-center gap-2"><RefreshCw size={16} /> Check for updates</span>)}
          </button>
        </div>
      </div>
      <InstallAppControl />
      <a
        href="https://github.com/sujaytumu/Chat-App/issues/new"
        target="_blank"
        rel="noreferrer"
        className={`${card} flex items-center gap-3 text-[16px] text-[#E9EDEF] hover:bg-[#233138]`}
      >
        <span className="flex-1">Report a problem</span>
        <ExternalLink size={18} className="text-[#8696A0]" />
      </a>
    </SettingsShell>
  );
};

export default AccountPage;
