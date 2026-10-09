import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { getReduceMotion, setReduceMotion, getHaptics, setHaptics, getEnterSends, setEnterSends } from "../lib/uiSettings";
import { formatChatListTime } from "../lib/utils";

const card = "rounded-xl bg-wa-surface p-4";
const label = "text-[13px] text-wa-muted mb-1.5";
const field =
  "w-full h-11 rounded-lg bg-wa-bg border border-wa-field px-3 text-[16px] text-wa-text placeholder:text-wa-muted2 focus:outline-none focus:border-[#25D366]";
const primaryBtn =
  "h-11 px-5 rounded-full bg-[#25D366] text-wa-bg font-semibold text-[15px] disabled:opacity-40 active:scale-[.98] transition";
const ghostBtn = "h-11 px-5 rounded-full border border-wa-field text-wa-text text-[15px] hover:bg-white/5 active:bg-white/10 disabled:opacity-40";

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
          <span className="absolute bottom-0 right-0 size-10 rounded-full bg-[#21C063] text-wa-bg flex items-center justify-center ring-4 ring-wa-bg">
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
        <p className="text-[12px] text-wa-muted2 mt-1.5 text-right">{about.length}/139</p>
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
        <p className="text-[16px] text-wa-text break-all">{authUser?.email}</p>
        <p className={`${label} mt-4`}>Member since</p>
        <p className="text-[16px] text-wa-text">
          {authUser?.createdAt ? new Date(authUser.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}
        </p>
      </div>

      <Link to="/settings/two-step" className={`${card} flex items-center gap-3 hover:bg-wa-pop`}>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] text-wa-text">Two-step verification</span>
          <span className="block text-[13.5px] text-wa-muted mt-0.5">
            {authUser?.twoFactor?.enabled ? "On · extra code when you sign in" : "Add a code from an authenticator app"}
          </span>
        </span>
        <span className="text-wa-muted">›</span>
      </Link>

      <form onSubmit={changePw} className={card}>
        <p className="text-[16px] text-wa-text mb-3">Change password</p>
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

/* ---------------- Two-step verification ---------------- */
const BackupCodes = ({ codes }) => {
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([`Talkies backup codes\nEach code works once.\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "talkies-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className={card}>
      <p className="text-[16px] text-wa-text">Your backup codes</p>
      <p className="text-[13.5px] text-wa-muted mt-0.5">
        Save these somewhere safe. If you lose your phone, each code lets you sign in once. They won&apos;t be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3 font-mono text-[16px] text-wa-text">
        {codes.map((c) => (
          <span key={c} className="rounded-lg bg-wa-bg px-3 py-2 text-center">{c}</span>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button className={ghostBtn} onClick={copy}>Copy</button>
        <button className={ghostBtn} onClick={save}>Download</button>
      </div>
    </div>
  );
};

export const TwoStepPage = () => {
  const [status, setStatus] = useState(null); // { enabled, backupCodesLeft }
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qr }
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null);
  const [mode, setMode] = useState(null); // null | "disable" | "regen"

  const load = () =>
    axiosInstance
      .get("/auth/2fa/status")
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ enabled: false, backupCodesLeft: 0 }));
  useEffect(() => {
    load();
  }, []);

  const err = (e, fallback) => toast.error(e?.response?.data?.message || fallback);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/auth/2fa/setup");
      const QR = await import("qrcode");
      const qr = await QR.toDataURL(data.otpauthUrl, { margin: 1, width: 220 });
      setSetup({ ...data, qr });
      setCode("");
    } catch (e) {
      err(e, "Couldn't start setup");
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/auth/2fa/enable", { code });
      setCodes(data.backupCodes);
      setSetup(null);
      setCode("");
      toast.success("Two-step verification is on");
      load();
    } catch (e) {
      err(e, "Couldn't turn it on");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await axiosInstance.post("/auth/2fa/disable", { password: pw, code });
      toast("Two-step verification is off");
      setMode(null);
      setPw("");
      setCode("");
      setCodes(null);
      load();
    } catch (e) {
      err(e, "Couldn't turn it off");
    } finally {
      setBusy(false);
    }
  };

  const regen = async () => {
    setBusy(true);
    try {
      const { data } = await axiosInstance.post("/auth/2fa/backup-codes", { code });
      setCodes(data.backupCodes);
      setMode(null);
      setCode("");
      load();
    } catch (e) {
      err(e, "Couldn't make new codes");
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (
    <input
      className={`${field} text-center tracking-[0.3em] text-[20px]`}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={mode === "disable" ? 11 : 7}
      placeholder="000000"
      value={code}
      onChange={(e) => setCode(e.target.value)}
    />
  );

  return (
    <SettingsShell title="Two-step verification" back="/settings/account">
      {status === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#25D366]" size={28} /></div>
      ) : (
        <>
          <div className={card}>
            <p className="text-[16px] text-wa-text">{status.enabled ? "Two-step verification is on" : "Add extra security to your account"}</p>
            <p className="text-[13.5px] text-wa-muted mt-1">
              {status.enabled
                ? `When you sign in, you'll enter a 6-digit code from your authenticator app after your password. ${status.backupCodesLeft} backup code${status.backupCodesLeft === 1 ? "" : "s"} left.`
                : "After your password, you'll also enter a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Even if someone learns your password, they can't sign in."}
            </p>
            {!status.enabled && !setup && (
              <div className="flex justify-end mt-3">
                <button className={primaryBtn} onClick={start} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" size={18} /> : "Turn on"}
                </button>
              </div>
            )}
          </div>

          {setup && (
            <div className={card}>
              <p className="text-[16px] text-wa-text">1. Scan this in your authenticator app</p>
              <div className="flex justify-center my-3">
                <img src={setup.qr} alt="Authenticator QR code" className="rounded-lg bg-white p-2" width={220} height={220} />
              </div>
              <p className="text-[13.5px] text-wa-muted">Can&apos;t scan? Enter this key instead:</p>
              <p className="font-mono text-[15px] text-wa-text break-all select-all mt-1">{setup.secret}</p>
              <a className="inline-block mt-2 text-[14px] text-[#25D366]" href={setup.otpauthUrl}>Open in authenticator app</a>
              <p className="text-[16px] text-wa-text mt-5 mb-2">2. Enter the 6-digit code it shows</p>
              {codeInput}
              <div className="flex justify-end gap-2 mt-3">
                <button className={ghostBtn} onClick={() => { setSetup(null); setCode(""); }}>Cancel</button>
                <button className={primaryBtn} onClick={enable} disabled={busy || code.replace(/\s/g, "").length !== 6}>
                  {busy ? <Loader2 className="animate-spin" size={18} /> : "Turn on"}
                </button>
              </div>
            </div>
          )}

          {codes && <BackupCodes codes={codes} />}

          {status.enabled && !mode && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button className={ghostBtn} onClick={() => { setMode("regen"); setCode(""); }}>New backup codes</button>
              <button className={`${ghostBtn} !text-[#F15C6D]`} onClick={() => { setMode("disable"); setCode(""); setPw(""); }}>Turn off</button>
            </div>
          )}

          {status.enabled && mode === "regen" && (
            <div className={card}>
              <p className="text-[16px] text-wa-text mb-2">Enter a code from your authenticator app</p>
              {codeInput}
              <p className="text-[12.5px] text-wa-muted2 mt-2">Your old backup codes stop working.</p>
              <div className="flex justify-end gap-2 mt-3">
                <button className={ghostBtn} onClick={() => setMode(null)}>Cancel</button>
                <button className={primaryBtn} onClick={regen} disabled={busy || code.replace(/\s/g, "").length !== 6}>Create</button>
              </div>
            </div>
          )}

          {status.enabled && mode === "disable" && (
            <div className={card}>
              <p className="text-[16px] text-wa-text mb-2">Confirm it&apos;s you</p>
              <input className={`${field} mb-3`} type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
              {codeInput}
              <p className="text-[12.5px] text-wa-muted2 mt-2">Use your authenticator code or a backup code.</p>
              <div className="flex justify-end gap-2 mt-3">
                <button className={ghostBtn} onClick={() => setMode(null)}>Cancel</button>
                <button className={primaryBtn} onClick={disable} disabled={busy || !pw || code.trim().length < 6}>Turn off</button>
              </div>
            </div>
          )}
        </>
      )}
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
        <p className="text-center text-wa-muted py-10 text-[15px]">No starred messages yet.<br />Long-press a message and tap Star to keep it here.</p>
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
              className="w-full flex items-start gap-3 pl-3 pr-4 py-3 text-left hover:bg-white/5 active:bg-wa-surface disabled:opacity-60"
            >
              <Avatar src={pic} name={name} isGroup={!!m.groupId} size="size-12" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] text-wa-text truncate">{name || "Chat"}</span>
                  <span className="text-xs text-wa-muted shrink-0">{formatChatListTime(m.createdAt)}</span>
                </span>
                <span className="block text-[14.5px] text-wa-muted line-clamp-2">{mine ? "You: " : ""}{body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </SettingsShell>
  );
};

/* ---------------- Privacy ---------------- */
export const PrivacyPage = () => {
  const { authUser } = useAuthStore();
  const { users, updatePrivacy, setUserBlocked } = useChatStore();
  const pv = authUser?.privacy || {};
  const blocked = useMemo(() => {
    const ids = new Set((authUser?.blockedUsers || []).map(String));
    return users.filter((u) => ids.has(String(u._id)));
  }, [authUser, users]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const blockedIds = new Set((authUser?.blockedUsers || []).map(String));
  const candidates = users.filter((u) => !blockedIds.has(String(u._id)) && u.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <SettingsShell title="Privacy">
      <p className="text-[13.5px] text-wa-muted px-1">Who can see what about you.</p>
      <ToggleRow
        title="Read receipts"
        sub="If you turn this off, you won't send or receive read receipts (blue ticks) in one-to-one chats. Group chats always show them."
        checked={pv.readReceipts !== false}
        onChange={(v) => updatePrivacy({ readReceipts: v })}
      />
      <ToggleRow
        title="Typing indicator"
        sub="Let people see when you're typing to them."
        checked={pv.typing !== false}
        onChange={(v) => updatePrivacy({ typing: v })}
      />
      <ToggleRow
        title="Show when I'm online"
        sub="If off, the green online dot is hidden from everyone."
        checked={pv.online !== false}
        onChange={(v) => updatePrivacy({ online: v })}
      />

      <Link to="/settings/two-step" className={`${card} flex items-center gap-3 hover:bg-wa-pop`}>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] text-wa-text">Two-step verification</span>
          <span className="block text-[13.5px] text-wa-muted mt-0.5">Add a code from an authenticator app when you sign in</span>
        </span>
        <span className="text-wa-muted">›</span>
      </Link>

      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[16px] text-wa-text">Blocked contacts</p>
            <p className="text-[13.5px] text-wa-muted mt-0.5">Blocked people can&apos;t message or call you, and you can&apos;t message them.</p>
          </div>
        </div>
        <div className="mt-3 -mx-2">
          {blocked.length === 0 && <p className="px-2 py-2 text-[14px] text-wa-muted2">No one is blocked.</p>}
          {blocked.map((u) => (
            <div key={u._id} className="flex items-center gap-3 px-2 py-2">
              <Avatar src={u.profilePic} name={u.fullName} size="size-10" />
              <span className="flex-1 min-w-0 truncate text-[16px] text-wa-text">{u.fullName}</span>
              <button className="text-[14px] font-medium text-[#25D366] px-3 py-1.5" onClick={() => setUserBlocked(u._id, false)}>
                Unblock
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-2">
          <button className={ghostBtn} onClick={() => setPicking((v) => !v)}>
            {picking ? "Done" : "Block someone"}
          </button>
        </div>
        {picking && (
          <div className="mt-3">
            <input className={field} placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 max-h-64 overflow-y-auto -mx-2">
              {candidates.slice(0, 50).map((u) => (
                <button
                  key={u._id}
                  className="w-full flex items-center gap-3 px-2 py-2 text-left hover:bg-white/5"
                  onClick={async () => {
                    if (window.confirm(`Block ${u.fullName}?`)) await setUserBlocked(u._id, true);
                  }}
                >
                  <Avatar src={u.profilePic} name={u.fullName} size="size-10" />
                  <span className="flex-1 min-w-0 truncate text-[16px] text-wa-text">{u.fullName}</span>
                </button>
              ))}
              {candidates.length === 0 && <p className="px-2 py-2 text-[14px] text-wa-muted2">No one found.</p>}
            </div>
          </div>
        )}
      </div>
    </SettingsShell>
  );
};

/* ---------------- Chats: archive / unarchive everything ---------------- */
export const ChatsSettingsPage = () => {
  const [enterSends, setEnter] = useState(getEnterSends());
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
      <ToggleRow
        title="Enter is send"
        sub="Enter key sends your message. Turn off to make Enter start a new line (Ctrl/Cmd + Enter then sends)."
        checked={enterSends}
        onChange={(v) => {
          setEnter(v);
          setEnterSends(v);
        }}
      />
      <div className={card}>
        <p className="text-[16px] text-wa-text">Chat history</p>
        <p className="text-[13.5px] text-wa-muted mt-0.5">Download a copy of all your chats, or pick one in Storage and data.</p>
        <div className="flex justify-end mt-3">
          <BackupButton />
        </div>
      </div>
      <div className={card}>
        <p className="text-[16px] text-wa-text">Archive all chats</p>
        <p className="text-[13.5px] text-wa-muted mt-0.5">Move every chat into Archived. You can bring them back any time.</p>
        <div className="flex justify-end mt-3">
          <button className={ghostBtn} disabled={busy || toArchive.length === 0} onClick={() => run(toArchive, true)}>
            Archive {toArchive.length}
          </button>
        </div>
      </div>
      <div className={card}>
        <p className="text-[16px] text-wa-text">Unarchive all chats</p>
        <p className="text-[13.5px] text-wa-muted mt-0.5">Return everything in Archived to your chat list.</p>
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

// Downloads your chats as a JSON file (all chats, or one: chat = "d:<id>" / "g:<id>").
const downloadBackup = async (chat) => {
  const res = await axiosInstance.get("/messages/export", { params: chat ? { chat } : {}, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `talkies-${chat ? "chat" : "chats"}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const BackupButton = ({ chat, label = "Back up chats" }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={ghostBtn}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadBackup(chat);
          toast.success("Backup downloaded");
        } catch {
          toast.error("Couldn't create the backup");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" size={18} /> : label}
    </button>
  );
};

export const StoragePage = () => {
  const { users, groups } = useChatStore();
  const [usage, setUsage] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [rows, setRows] = useState(null);

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
    let live = true;
    axiosInstance
      .get("/messages/storage-usage")
      .then((r) => live && setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  const named = useMemo(() => {
    const byKey = new Map([
      ...users.map((u) => [`d:${u._id}`, { name: u.fullName, pic: u.profilePic, group: false }]),
      ...groups.map((g) => [`g:${g._id}`, { name: g.name, pic: g.groupPic, group: true }]),
    ]);
    return (rows || []).map((r) => ({ ...r, ...(byKey.get(r.key) || { name: "Chat", pic: "", group: r.key[0] === "g" }) }));
  }, [rows, users, groups]);
  const totals = useMemo(
    () => named.reduce((t, r) => ({ messages: t.messages + r.messages, photos: t.photos + r.photos, files: t.files + r.files, bytes: t.bytes + r.fileBytes }), { messages: 0, photos: 0, files: 0, bytes: 0 }),
    [named]
  );

  const clear = async () => {
    setClearing(true);
    try {
      clearChatCache();
      if (window.caches) await Promise.all((await caches.keys()).filter((k) => k !== "prefs-v1").map((k) => caches.delete(k)));
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
        <p className={label}>Your chats</p>
        <p className="text-[26px] text-wa-text">{rows === null ? "…" : `${totals.messages.toLocaleString()} messages`}</p>
        <p className="text-[13.5px] text-wa-muted mt-1">
          {rows === null ? "Counting…" : `${totals.photos.toLocaleString()} photos · ${totals.files.toLocaleString()} files${totals.bytes ? ` (${fmtBytes(totals.bytes)})` : ""}`}
        </p>
        <div className="flex justify-end mt-3">
          <BackupButton />
        </div>
        <p className="text-[12.5px] text-wa-muted2 mt-2">The backup is a JSON file with every message&apos;s text, time and sender, plus links to photos and files.</p>
      </div>

      <div className={card}>
        <p className="text-[16px] text-wa-text mb-1">Manage storage</p>
        {rows === null && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[#25D366]" size={22} /></div>}
        {rows !== null && named.length === 0 && <p className="text-[14px] text-wa-muted2 py-2">No messages yet.</p>}
        <div className="-mx-2">
          {named.slice(0, 30).map((r) => (
            <div key={r.key} className="flex items-center gap-3 px-2 py-2">
              <Avatar src={r.pic} name={r.name} isGroup={r.group} size="size-10" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] text-wa-text truncate">{r.name}</span>
                <span className="block text-[13px] text-wa-muted">
                  {r.messages.toLocaleString()} messages{r.photos ? ` · ${r.photos} photos` : ""}{r.files ? ` · ${r.files} files` : ""}
                </span>
              </span>
              <BackupButton chat={r.key} label="Export" />
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <p className={label}>Stored on this device</p>
        <p className="text-[22px] text-wa-text">{usage === null ? "…" : fmtBytes(usage)}</p>
        <p className="text-[13.5px] text-wa-muted mt-1">Saved app files and your last-seen chat list, so Talkies opens fast. Your messages stay on the server.</p>
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
        <p className="text-[16px] text-wa-text font-mono">{currentBuildId()}</p>
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
        className={`${card} flex items-center gap-3 text-[16px] text-wa-text hover:bg-wa-pop`}
      >
        <span className="flex-1">Report a problem</span>
        <ExternalLink size={18} className="text-wa-muted" />
      </a>
    </SettingsShell>
  );
};

export default AccountPage;
