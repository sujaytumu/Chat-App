import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Check, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import Avatar from "../components/Avatar";
import { useAuthStore } from "../store/useAuthStore";
import { closeAccessPopup, closeAllAccessPopups } from "../lib/accessPopups";

// Owner only: choose which people can see each other. Everyone else sees only the people allowed here
// (plus people they already chat with, and the owner).
const OWNER_EMAIL_FALLBACK = "sujaybabutumu@gmail.com";

const timeAgo = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"} ago`;
};

const AccessPage = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [requests, setRequests] = useState([]); // people waiting for the owner's answer
  const [users, setUsers] = useState([]);
  const [pairs, setPairs] = useState(new Set()); // "idA|idB" sorted
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [who, setWho] = useState(null); // the person whose list I'm editing
  const [q, setQ] = useState("");
  const [ownerIdSrv, setOwnerIdSrv] = useState(null); // the server says who the owner is
  const [staged, setStaged] = useState(new Map()); // choices made for a person who is still waiting: saved only when I approve
  const [saving, setSaving] = useState(false);
  const isOwnerUser = (u) => (ownerIdSrv ? u?._id === ownerIdSrv : String(u?.email || "").trim().toLowerCase() === OWNER_EMAIL_FALLBACK);

  const socket = useAuthStore((s) => s.socket);
  const loadRequests = () => axiosInstance.get("/admin/requests").then((r) => setRequests(r.data)).catch(() => {});

  const key = (a, b) => [a, b].sort().join("|");
  useEffect(() => {
    axiosInstance
      .get("/admin/access")
      .then((r) => {
        setUsers(r.data.users);
        setPairs(new Set(r.data.pairs.map(([a, b]) => key(a, b))));
        setOwnerIdSrv(r.data.ownerId || null);
      })
      .catch((e) => setDenied(e.response?.status === 403))
      .finally(() => setLoading(false));
    loadRequests();
    closeAllAccessPopups(); // the waiting people are listed right here
  }, []);

  // Live: a new request appears at once; one answered on another device disappears.
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = () => loadRequests();
    const onGone = ({ userId }) => {
      closeAccessPopup(userId);
      setRequests((r) => r.filter((x) => String(x.user._id) !== String(userId)));
    };
    socket.on("accessRequest", onNew);
    socket.on("accessRequestResolved", onGone);
    socket.on("connect", onNew);
    return () => {
      socket.off("accessRequest", onNew);
      socket.off("accessRequestResolved", onGone);
      socket.off("connect", onNew);
    };
  }, [socket]);

  // Opened from a request: go straight to that person.
  useEffect(() => {
    const id = params.get("user");
    if (id && users.length && !who) setWho(users.find((u) => u._id === id) || null);
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingForWho = who ? requests.find((r) => r.user._id === who._id) : null;
  const isOn = (otherId) => {
    const k = key(who._id, otherId);
    return staged.has(k) ? staged.get(k) : pairs.has(k);
  };
  const chosenCount = who ? users.filter((u) => u._id !== who._id && !isOwnerUser(u) && isOn(u._id)).length : 0;

  const decline = async (r) => {
    if (!window.confirm(`Decline ${r.user.fullName}'s request? They can ask again.`)) return false;
    try {
      await axiosInstance.put(`/admin/requests/${r.user._id}`, { status: "declined" });
      setRequests((list) => list.filter((x) => x.user._id !== r.user._id));
      closeAccessPopup(r.user._id);
      toast.success("Declined — they have been told");
      return true;
    } catch {
      toast.error("Couldn't save that");
      return false;
    }
  };

  // Approve: first save everything chosen for this person, then tell them. Nothing reaches them before this.
  const approve = async () => {
    if (!who || saving) return;
    if (pendingForWho && chosenCount === 0) return toast.error("Choose at least one person, or decline the request");
    setSaving(true);
    try {
      await Promise.all([...staged].map(([k, allowed]) => {
        const [a, b] = k.split("|");
        return axiosInstance.put("/admin/access", { a, b, allowed });
      }));
      setPairs((p) => {
        const n = new Set(p);
        staged.forEach((allowed, k) => (allowed ? n.add(k) : n.delete(k)));
        return n;
      });
      setStaged(new Map());
      if (pendingForWho) {
        await axiosInstance.put(`/admin/requests/${who._id}`, { status: "approved" });
        setRequests((r) => r.filter((x) => x.user._id !== who._id));
        closeAccessPopup(who._id);
        toast.success(`${who.fullName?.split(" ")[0] || "They"} can now see ${chosenCount} ${chosenCount === 1 ? "person" : "people"} — they have been told`);
      } else {
        toast.success("Saved");
      }
      setWho(null);
      setQ("");
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save that");
    } finally {
      setSaving(false);
    }
  };
  const back = () => {
    if (staged.size && !window.confirm("Leave without saving your choices?")) return;
    setStaged(new Map());
    setWho(null);
    setQ("");
  };

  const toggle = async (other) => {
    if (isOwnerUser(other)) return toast(`${other.fullName?.split(" ")[0] || "The owner"} is always allowed`, { icon: "✅" });
    const k = key(who._id, other._id);
    const allowed = !isOn(other._id);
    if (pendingForWho) {
      // still waiting for my answer: just remember the choice, nothing is granted until I approve
      setStaged((m) => new Map(m).set(k, allowed));
      return;
    }
    setPairs((p) => {
      const n = new Set(p);
      allowed ? n.add(k) : n.delete(k);
      return n;
    });
    try {
      await axiosInstance.put("/admin/access", { a: who._id, b: other._id, allowed });
    } catch {
      toast.error("Couldn't save that change");
      setPairs((p) => {
        const n = new Set(p);
        allowed ? n.delete(k) : n.add(k);
        return n;
      });
    }
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => u._id !== who?._id && (!needle || u.fullName?.toLowerCase().includes(needle) || u.email?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(isOwnerUser(b)) - Number(isOwnerUser(a))); // the owner is always first
  }, [users, q, who, ownerIdSrv]);
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => !needle || u.fullName?.toLowerCase().includes(needle) || u.email?.toLowerCase().includes(needle));
  }, [users, q]);
  const ownerId = ownerIdSrv || users.find(isOwnerUser)?._id;
  const countFor = (id) => [...pairs].filter((p) => p.split("|").includes(id) && !(ownerId && p.split("|").includes(ownerId))).length + (ownerId && id !== ownerId ? 1 : 0);

  if (denied) return <div className="flex-1 flex items-center justify-center text-wa-muted p-8 text-center">Only the owner can open this page.</div>;

  return (
    <div className="relative flex-1 min-w-0 w-full min-h-0 flex flex-col overflow-x-hidden bg-wa-bg text-wa-text">
      <div className="flex items-center gap-3 px-3 pt-4 pb-2">
        <button onClick={() => (who ? back() : nav(-1))} className="size-10 flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#21C063]" /> {who ? who.fullName : "Who can see whom"}
          </h1>
          <p className="text-[12px] text-wa-muted">{who ? (pendingForWho ? "Tick the people they may see, then approve. Nothing is shared until you approve." : "Changes here are saved as you tick. Ticked people see each other.") : "Pick a person, then choose who they can see"}</p>
        </div>
      </div>
      <div className="mx-4 my-2 flex items-center gap-3 h-11 rounded-full bg-wa-surface px-4">
        <Search size={18} className="text-wa-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-wa-muted" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[calc(170px+env(safe-area-inset-bottom))] lg:pb-28">
        {loading && <p className="text-center text-wa-muted text-[13px] pt-10">Loading…</p>}
        {!who && requests.length > 0 && (
          <div className="mx-4 mb-3 rounded-2xl bg-wa-surface p-3">
            <p className="text-[12.5px] font-medium text-[#21C063] mb-2">Waiting for your answer ({requests.length})</p>
            {requests.map((r) => (
              <div key={r._id} className="py-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar src={r.user.profilePic} name={r.user.fullName} size="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] truncate">{r.user.fullName}</p>
                    <p className="text-[11.5px] text-wa-muted truncate">{r.user.email} · asked {timeAgo(r.at)}</p>
                  </div>
                  <button onClick={() => decline(r)} className="h-8 px-3 shrink-0 rounded-full bg-white/10 text-[12.5px]">Decline</button>
                  <button onClick={() => { setStaged(new Map()); setWho(users.find((u) => u._id === r.user._id) || null); setQ(""); }} className="h-8 px-3 shrink-0 rounded-full bg-[#25D366] text-[#0B141A] text-[12.5px] font-semibold">Review</button>
                </div>
                {r.note ? <p className="mt-1.5 ml-12 text-[12.5px] text-wa-text/90 bg-white/5 rounded-xl px-3 py-1.5 break-words">“{r.note}”</p> : null}
              </div>
            ))}
          </div>
        )}
        {!who &&
          people.map((u) => (
            <button key={u._id} onClick={() => (setWho(u), setQ(""))} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-wa-surface/70">
              <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] truncate">{u.fullName}</span>
                <span className="block text-[12px] text-wa-muted truncate">{u.email}</span>
              </span>
              <span className="text-[12px] text-wa-muted shrink-0">{countFor(u._id)} allowed</span>
            </button>
          ))}
        {who &&
          list.map((u) => {
            const on = isOwnerUser(u) || isOn(u._id); // the owner is ticked for everybody
            return (
              <button key={u._id} onClick={() => toggle(u)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-wa-surface/70">
                <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] truncate">{u.fullName}</span>
                  <span className="block text-[12px] text-wa-muted truncate">{isOwnerUser(u) ? "Owner · always allowed" : u.email}</span>
                </span>
                <span className={`size-6 rounded-md border-2 flex items-center justify-center ${on ? "bg-[#21C063] border-[#21C063] text-[#0B141A]" : "border-wa-muted"}`}>{on && <Check size={15} strokeWidth={3.5} />}</span>
              </button>
            );
          })}
      </div>
      {who && (
        <div className="absolute inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-0 p-4 pt-8 bg-gradient-to-t from-wa-bg via-wa-bg/95 to-transparent z-20 flex gap-2">
          {pendingForWho && (
            <button onClick={() => decline(pendingForWho).then((done) => { if (done) { setStaged(new Map()); setWho(null); } })} className="h-12 px-5 rounded-full bg-wa-surface font-medium active:scale-[0.99]">Decline</button>
          )}
          <button onClick={approve} disabled={saving || (pendingForWho && chosenCount === 0)} className="flex-1 h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold active:scale-[0.99] disabled:opacity-50">
            {saving ? "Saving…" : pendingForWho ? (chosenCount ? `Approve · ${chosenCount} ${chosenCount === 1 ? "person" : "people"}` : "Choose at least one person") : "Done"}
          </button>
        </div>
      )}
    </div>
  );
};

export default AccessPage;
