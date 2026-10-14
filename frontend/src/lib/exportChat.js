import toast from "react-hot-toast";
import { axiosInstance } from "./axios";

const PAGE = 200;
const MAX = 5000; // newest messages kept in the export

const stamp = (d) => {
  const t = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}, ${p(t.getHours())}:${p(t.getMinutes())}`;
};

function describe(m) {
  if (m.deletedForEveryone) return "This message was deleted";
  const parts = [];
  if (m.image) parts.push("<image>");
  else if (m.file?.url) parts.push(`<${m.file.type || "file"}: ${m.file.name || "attachment"}>`);
  else if (m.poll) parts.push(`<poll: ${m.poll.question || ""}>`);
  if (m.text) parts.push(m.text);
  return parts.join(" ") || "<message>";
}

// Export a chat as a plain-text file ("[date, time] Name: message"), like WhatsApp's "Export chat".
export async function exportChat(chat, { myId, myName }) {
  const id = chat.data._id;
  const url = chat.type === "group" ? `/groups/${id}/messages` : `/messages/${id}`;
  const title = chat.type === "group" ? chat.data.name : chat.data.fullName;
  const nameOf = (senderId) => {
    if (String(senderId) === String(myId)) return myName || "You";
    if (chat.type === "group") return chat.data.members.find((x) => String(x._id) === String(senderId))?.fullName || "Unknown";
    return chat.data.fullName;
  };

  const toastId = toast.loading("Preparing export…");
  try {
    let all = [];
    let before;
    while (all.length < MAX) {
      const res = await axiosInstance.get(url, { params: { limit: PAGE, ...(before ? { before } : {}) } });
      const page = res.data;
      all = [...page, ...all];
      if (page.length < PAGE) break;
      before = page[0].createdAt;
    }
    const body = all.map((m) => `[${stamp(m.createdAt)}] ${nameOf(m.senderId)}: ${describe(m)}`).join("\n");
    const text = `Chat with ${title}\n\n${body}\n`;
    const file = new File([text], `Talkies chat - ${title}.txt`, { type: "text/plain" });
    toast.dismiss(toastId);

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast.success("Chat exported");
    }
  } catch {
    toast.dismiss(toastId);
    toast.error("Couldn't export this chat");
  }
}
