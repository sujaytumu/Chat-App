import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { compressImage } from "./imageUtils";

// Instagram-style "reply with a photo": opens the camera (a gallery picker on a laptop) and sends the picture
// as a reply to that message.
export function replyWithPhoto(message) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "user"); // front camera on phones
  input.style.display = "none";
  input.onchange = async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const image = await compressImage(file);
      const st = useChatStore.getState();
      st.setReplyingTo(message);
      await st.sendMessage({ image });
    } catch {
      toast.error("Couldn't send that photo");
    }
  };
  document.body.appendChild(input);
  input.click();
}
