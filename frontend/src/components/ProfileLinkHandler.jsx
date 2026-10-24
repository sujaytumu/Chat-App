import { useEffect } from "react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

// Profile link: …/?u=username (kept through sign-in) opens a chat with that person.
const KEY = "talkies-user-link";

export const rememberProfileLink = () => {
  try {
    const u = new URLSearchParams(window.location.search).get("u");
    if (u) sessionStorage.setItem(KEY, u.slice(0, 40));
  } catch {
    /* ignore */
  }
};

const ProfileLinkHandler = () => {
  const me = useAuthStore((s) => s.authUser?._id);
  useEffect(() => {
    if (!me) return;
    let name = null;
    try {
      name = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    if (!name) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("u");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    axiosInstance
      .get(`/auth/u/${encodeURIComponent(name)}`)
      .then((res) => {
        const person = res.data;
        if (String(person._id) === String(me)) return toast("That's your own profile link");
        const known = useChatStore.getState().users.find((u) => String(u._id) === String(person._id));
        useChatStore.getState().setSelectedChat({ type: "direct", data: known || person });
      })
      .catch((err) => {
        const handle = name.replace(/^@/, "");
        if (err.response?.status === 403) {
          // Not allowed to see them yet: the owner is asked, and decides.
          axiosInstance.post("/access/request", { note: `wants to see @${handle}` }).catch(() => {});
          toast(`You need the owner's permission to see @${handle}. A request was sent.`, { icon: "🔒", duration: 6000 });
          return;
        }
        toast.error(`No one found with @${handle}`);
      });
  }, [me]);
  return null;
};

export default ProfileLinkHandler;
