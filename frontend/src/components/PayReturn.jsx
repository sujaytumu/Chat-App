import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

// Back from Razorpay's full-screen checkout (/?pay=ok|failed|cancelled): say how it went and put the person back
// in the chat they were paying from, so they carry straight on.
const PayReturn = () => {
  const authUser = useAuthStore((s) => s.authUser);
  const users = useChatStore((s) => s.users);
  const navigate = useNavigate();
  useEffect(() => {
    if (!authUser) return;
    const q = new URLSearchParams(window.location.search);
    const r = q.get("pay");
    if (!r) return;
    let want = "";
    try {
      want = localStorage.getItem("talkies-pay-return") || "";
    } catch { /* optional */ }
    const user = want ? users.find((u) => u._id === want) : null;
    if (want && !user && !users.length) return; // contacts still loading: run again when they arrive
    if (r === "ok") toast.success("Payment sent ✅", { duration: 5000 });
    else if (r === "cancelled") toast("Payment cancelled");
    else toast.error(q.get("reason") || "Payment could not be completed", { duration: 7000 });
    try {
      localStorage.removeItem("talkies-pay-return");
    } catch { /* optional */ }
    window.history.replaceState({}, "", "/");
    if (user) {
      navigate("/", { replace: true });
      useChatStore.getState().setSelectedChat({ type: "direct", data: user });
    } else if (!users.length) {
      navigate("/settings/payments", { replace: true });
    }
  }, [authUser, users, navigate]);
  return null;
};

export default PayReturn;
