import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Check, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import Avatar from "../components/Avatar";

// Owner only: choose which people can see each other. Everyone else sees only the people allowed here
// (plus people they already chat with, and the owner).
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

  const key = (a, b) => [a, b].sort().join("|");
  useEffect(() => {
    axiosInstance
      .get("/admin/access")
      .then((r) => {
        setUsers(r.data.users);
        setPairs(new Set(r.data.pairs.map(([a, b]) => key(a, b))));
      })
      .catch((e) => setDenied(e.response?.status === 403))
      .finally(() => setLoading(false));
    axiosInstance.get("/admin/requests").then((r) => setRequests(r.data)).catch(() => {});
  }, []);

  // Opened from a request: go straight to that person.
  useEffect(() => {
    const id = params.get("user");
    if (id && users.length && !who) setWho(users.find((u) => u._id === id) || null);
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (userId, status) => {
    try {
      await axiosInstance.put(`/admin/requests/${userId}`, { status });
      setRequests((r) => r.filter((x) => x.user._id !== userId));
      toast.success(status === "approved" ? "They have been told" : "Declined");
      if (status === "approved") {
        setWho(null);
        setQ("");
      }
    } catch {
      toast.error("Couldn't save that");
    }
  };
  const pendingForWho = who ? requests.find((r) => r.user._id === who._id) : null;

  const toggle = async (other) => {
    const k = key(who._id, other._id);
    const allowed = !pairs.has(k);
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
    return users.filter((u) => u._id !== who?._id && (!needle || u.fullName?.toLowerCase().includes(needle) || u.email?.toLowerCase().includes(needle)));
  }, [users, q, who]);
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => !needle || u.fullName?.toLowerCase().includes(needle) || u.email?.toLowerCase().includes(needle));
  }, [users, q]);
  const countFor = (id) => [...pairs].filter((p) => p.split("|").includes(id)).length;

  if (denied) return <div className="flex-1 flex items-center justify-center text-wa-muted p-8 text-center">Only the owner can open this page.</div>;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-wa-bg text-wa-text">
      <div className="flex items-center gap-3 px-3 pt-4 pb-2">
        <button onClick={() => (who ? (setWho(null), setQ("")) : nav(-1))} className="size-10 flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#21C063]" /> {who ? who.fullName : "Who can see whom"}
          </h1>
          <p className="text-[12px] text-wa-muted">{who ? "Tick the people they are allowed to see (they will see each other)" : "Pick a person, then choose who they can see"}</p>
        </div>
      </div>
      <div className="mx-4 my-2 flex items-center gap-3 h-11 rounded-full bg-wa-surface px-4">
        <Search size={18} className="text-wa-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-wa-muted" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pb-24">
        {loading && <p className="text-center text-wa-muted text-[13px] pt-10">Loading…</p>}
        {!who && requests.length > 0 && (
          <div className="mx-4 mb-3 rounded-2xl bg-wa-surface p-3">
            <p className="text-[12.5px] font-medium text-[#21C063] mb-2">Waiting for your answer ({requests.length})</p>
            {requests.map((r) => (
              <div key={r._id} className="flex items-center gap-3 py-2">
                <Avatar src={r.user.profilePic} name={r.user.fullName} size="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] truncate">{r.user.fullName}</p>
                  <p className="text-[11.5px] text-wa-muted truncate">wants to see more people</p>
                </div>
                <button onClick={() => decide(r.user._id, "declined")} className="h-8 px-3 rounded-full bg-white/10 text-[12.5px]">Decline</button>
                <button onClick={() => { setWho(users.find((u) => u._id === r.user._id) || null); setQ(""); }} className="h-8 px-3 rounded-full bg-[#25D366] text-[#0B141A] text-[12.5px] font-semibold">Choose</button>
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
              <span className="text-[12px] text-wa-muted">{countFor(u._id)} allowed</span>
            </button>
          ))}
        {who &&
          list.map((u) => {
            const on = pairs.has(key(who._id, u._id));
            return (
              <button key={u._id} onClick={() => toggle(u)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-wa-surface/70">
                <Avatar src={u.profilePic} name={u.fullName} size="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] truncate">{u.fullName}</span>
                  <span className="block text-[12px] text-wa-muted truncate">{u.email}</span>
                </span>
                <span className={`size-6 rounded-md border-2 flex items-center justify-center ${on ? "bg-[#21C063] border-[#21C063] text-[#0B141A]" : "border-wa-muted"}`}>{on && <Check size={15} strokeWidth={3.5} />}</span>
              </button>
            );
          })}
      </div>
      {pendingForWho && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-wa-bg via-wa-bg/95 to-transparent">
          <button onClick={() => decide(who._id, "approved")} className="w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold">
            Done — let {who.fullName?.split(" ")[0]} in
          </button>
        </div>
      )}
    </div>
  );
};

export default AccessPage;
