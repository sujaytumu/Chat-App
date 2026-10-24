import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ArrowUpRight, ArrowDownLeft, IndianRupee, Search, X, ShieldCheck, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import SettingsShell from "../components/SettingsShell";
import Avatar from "../components/Avatar";
import PaymentModal from "../components/PaymentModal";
import { axiosInstance } from "../lib/axios";
import { inr } from "../lib/razorpay";
import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";

const when = (iso) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const sectionHead = "px-5 pt-5 pb-2 text-[14px] text-wa-muted";

// Full-screen "pick who to pay", like WhatsApp's New payment.
const PickContact = ({ users, onPick, onClose }) => {
  useBackToClose(true, onClose);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => !s || (u.fullName || "").toLowerCase().includes(s));
  }, [users, q]);
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[150] bg-wa-bg text-wa-text flex flex-col">
      <div className="flex items-center gap-2 h-14 px-2 shrink-0">
        <button onClick={onClose} aria-label="Close" className="size-11 rounded-full flex items-center justify-center active:bg-white/10">
          <X size={24} />
        </button>
        <h2 className="text-[18.5px] font-normal">Send payment to…</h2>
      </div>
      <div className="px-4 pb-2">
        <div className="flex items-center gap-3 h-11 rounded-full bg-wa-field px-4">
          <Search size={18} className="text-wa-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-wa-muted" autoFocus />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        {list.length === 0 ? (
          <p className="text-center text-wa-muted text-[14px] py-12">No one found</p>
        ) : (
          list.map((u) => (
            <button key={u._id} onClick={() => onPick(u)} className="w-full flex items-center gap-4 px-5 py-3 text-left active:bg-white/5">
              <Avatar src={u.profilePic} name={u.fullName || ""} size="size-12" textSize="text-lg" />
              <span className="text-[16px] truncate">{u.fullName}</span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
};

// Change the mobile number that gets payment text messages (needs the PIN).
const PhoneSheet = ({ current, pinSet, onClose, onSaved }) => {
  useBackToClose(true, onClose);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = /^[6-9]\d{9}$/.test(phone) && /^\d{6}$/.test(pin);
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await axiosInstance.post("/payments/phone", { phone, pin });
      toast.success("Number saved");
      onSaved(r.data?.phone || `+91${phone}`);
    } catch (e) {
      const d = e.response?.data;
      setErr(d?.attemptsLeft != null ? `Wrong PIN · ${d.attemptsLeft} left` : d?.error || "Couldn't save the number");
    }
    setBusy(false);
  };
  return createPortal(
    <div className="wa-dark fixed inset-0 z-[150] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-wa-panel text-wa-text p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-semibold">Payment text messages</h3>
        <p className="text-[13px] text-wa-muted mt-1">{current ? `Texts go to ${current}.` : "Add the number that should get a text when money is sent or received."}</p>
        {!pinSet ? (
          <p className="mt-4 rounded-xl bg-wa-field px-4 py-3 text-[13.5px] text-wa-muted">Make your first payment to create your PIN. You can add your number there too.</p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-wa-field px-4 h-12">
              <span className="text-wa-muted">+91</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="10-digit mobile number" className="flex-1 bg-transparent outline-none" autoFocus />
            </div>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" placeholder="Your 6-digit PIN" className="mt-3 w-full h-12 rounded-xl bg-wa-field px-4 outline-none tracking-[0.3em]" />
            <p className={`h-5 mt-2 text-[13px] ${err ? "text-[#F15C6D]" : "text-transparent"}`}>{err || "."}</p>
            <button onClick={save} disabled={!ok || busy} className="mt-2 w-full h-12 rounded-full bg-[#25D366] text-[#0B141A] font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 size={18} className="animate-spin" />} Save number
            </button>
          </>
        )}
        <button onClick={onClose} className="mt-2 w-full h-10 text-[14px] text-wa-muted">
          Close
        </button>
      </div>
    </div>,
    document.body
  );
};

const PaymentsPage = () => {
  const users = useChatStore((s) => s.users);
  const getUsers = useChatStore((s) => s.getUsers);
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [picking, setPicking] = useState(false);
  const [payTo, setPayTo] = useState(null);
  const [pinInfo, setPinInfo] = useState({ set: false, phone: "" });
  const [phoneSheet, setPhoneSheet] = useState(false);

  const load = useCallback(() => {
    axiosInstance.get("/payments").then((r) => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, []);
  // Back from Razorpay's full-screen checkout (the Android app): say how it went, then tidy the address
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("pay");
    if (!r) return;
    if (r === "ok") toast.success("Payment sent ✅", { duration: 5000 });
    else if (r === "cancelled") toast("Payment cancelled");
    else toast.error(q.get("reason") || "Payment could not be completed", { duration: 7000 });
    window.history.replaceState({}, "", window.location.pathname);
  }, []);
  useEffect(() => {
    load();
    axiosInstance.get("/payments/config").then((r) => setCfg(r.data)).catch(() => setCfg({ enabled: true }));
    axiosInstance.get("/payments/pin").then((r) => setPinInfo(r.data || { set: false, phone: "" })).catch(() => {});
    if (!users.length) getUsers?.();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // People you paid or chat with most recently come first, like WhatsApp's "People" strip.
  const people = useMemo(() => {
    const seen = new Set();
    const out = [];
    (rows || []).forEach((p) => {
      const id = String(p.other?._id || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ _id: id, fullName: p.other.fullName, profilePic: p.other.profilePic });
      }
    });
    users.forEach((u) => {
      const id = String(u._id);
      if (!seen.has(id) && out.length < 12) {
        seen.add(id);
        out.push(u);
      }
    });
    return out.slice(0, 12);
  }, [rows, users]);

  const totals = useMemo(() => {
    let sent = 0;
    let got = 0;
    (rows || []).forEach((p) => (p.direction === "sent" ? (sent += p.amount) : (got += p.amount)));
    return { sent, got };
  }, [rows]);

  return (
    <SettingsShell title="Payments" back="/" flush>
      {/* Test notice */}
      <p className="mx-4 mt-2 rounded-2xl bg-[#E8A33D]/15 text-[#E8A33D] px-4 py-3 text-[12.5px] leading-snug">
        Test payments: play money, no real money moves. Each payment is approved with your 6-digit PIN.
      </p>

      {/* Main actions */}
      <button onClick={() => setPicking(true)} className="w-full flex items-center gap-4 px-5 py-4 text-left active:bg-white/5">
        <span className="size-12 rounded-full bg-[#25D366] text-[#0B141A] flex items-center justify-center">
          <IndianRupee size={22} />
        </span>
        <span>
          <span className="block text-[16.5px]">New payment</span>
          <span className="block text-[13px] text-wa-muted">Send money to someone in Talkies</span>
        </span>
      </button>

      {/* People */}
      {people.length > 0 && (
        <>
          <p className={sectionHead}>People</p>
          <div className="flex gap-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {people.map((u) => (
              <button key={u._id} onClick={() => setPayTo(u)} className="w-16 shrink-0 flex flex-col items-center gap-1.5 active:opacity-70">
                <Avatar src={u.profilePic} name={u.fullName || ""} size="size-14" textSize="text-xl" />
                <span className="text-[12px] text-wa-text truncate w-full text-center">{(u.fullName || "").split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Summary */}
      {rows && rows.length > 0 && (
        <div className="mx-4 mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-wa-field px-4 py-3">
            <p className="text-[12px] text-wa-muted flex items-center gap-1"><ArrowUpRight size={14} className="text-[#F15C6D]" /> Sent</p>
            <p className="text-[19px] font-medium mt-0.5">{inr(totals.sent)}</p>
          </div>
          <div className="rounded-2xl bg-wa-field px-4 py-3">
            <p className="text-[12px] text-wa-muted flex items-center gap-1"><ArrowDownLeft size={14} className="text-[#25D366]" /> Received</p>
            <p className="text-[19px] font-medium mt-0.5">{inr(totals.got)}</p>
          </div>
        </div>
      )}

      {/* History */}
      <p className={sectionHead}>History</p>
      {rows === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-wa-muted" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-wa-muted text-[14px] py-10 px-8">No payments yet. Tap New payment to send your first one.</p>
      ) : (
        rows.map((p) => (
          <div key={p._id} className="flex items-center gap-3 px-5 py-3">
            <Avatar src={p.other?.profilePic} name={p.other?.fullName || ""} size="size-12" textSize="text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] truncate">{p.other?.fullName || "Someone"}</p>
              <p className="text-[12.5px] text-wa-muted truncate flex items-center gap-1">
                {p.direction === "sent" ? <ArrowUpRight size={14} className="text-[#F15C6D]" /> : <ArrowDownLeft size={14} className="text-[#25D366]" />}
                {when(p.paidAt)}
                {p.test ? " · test" : ""}
                {p.note ? ` · ${p.note}` : ""}
              </p>
            </div>
            <p className={`text-[15.5px] font-medium ${p.direction === "sent" ? "text-wa-text" : "text-[#25D366]"}`}>
              {p.direction === "sent" ? "-" : "+"}
              {inr(p.amount)}
            </p>
          </div>
        ))
      )}

      <button onClick={() => setPhoneSheet(true)} className="w-full flex items-center gap-4 px-5 py-4 mt-3 text-left active:bg-white/5">
        <span className="size-12 rounded-full bg-wa-field flex items-center justify-center text-wa-icon">
          <Smartphone size={22} />
        </span>
        <span className="min-w-0">
          <span className="block text-[16px]">Payment text messages</span>
          <span className="block text-[13px] text-wa-muted truncate">{pinInfo.phone ? `Texts to ${pinInfo.phone}` : "Add your mobile number"}</span>
        </span>
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-wa-muted px-8 pt-4 pb-2 text-center">
        <ShieldCheck size={14} /> Approved with your PIN · test payments
      </p>
      {phoneSheet && (
        <PhoneSheet
          current={pinInfo.phone}
          pinSet={pinInfo.set}
          onClose={() => setPhoneSheet(false)}
          onSaved={(ph) => {
            setPinInfo((p) => ({ ...p, phone: ph }));
            setPhoneSheet(false);
          }}
        />
      )}

      {picking && (
        <PickContact
          users={users}
          onClose={() => setPicking(false)}
          onPick={(u) => {
            setPicking(false);
            setPayTo(u);
          }}
        />
      )}
      {payTo && <PaymentModal user={payTo} onClose={() => setPayTo(null)} onDone={load} />}
    </SettingsShell>
  );
};

export default PaymentsPage;
