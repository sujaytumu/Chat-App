import toast from "react-hot-toast";
import { axiosInstance } from "./axios";

const waitText = (ms) => {
  const h = Math.ceil(ms / 3600000);
  return ms >= 3600000 ? `${h} hour${h === 1 ? "" : "s"}` : `${Math.max(1, Math.ceil(ms / 60000))} min`;
};

// "Ask to see more people": sends the request to the owner (they get a popup). Handles waiting / declined / cooldown.
export async function askMorePeople() {
  try {
    const { data } = await axiosInstance.get("/access/mine");
    if (data.owner) return toast("You can already see everyone", { icon: "✅" });
    if (data.status === "pending") return toast("Your request is with the owner — you'll be told when they answer", { icon: "⏳" });
    if (data.retryAt && data.retryAt > Date.now()) return toast(`You can ask again in ${waitText(data.retryAt - Date.now())}`, { icon: "⏳" });
    if (data.status === "declined" && !window.confirm("Your last request was declined. Send it again?")) return;
    await axiosInstance.post("/access/request", {});
    toast.success("Request sent to the owner");
  } catch (e) {
    const retryAt = e.response?.data?.retryAt;
    toast.error(retryAt ? `You can ask again in ${waitText(retryAt - Date.now())}` : e.response?.data?.error || "Couldn't send the request");
  }
}
