import { useEffect } from "react";
import { Phone, Video } from "lucide-react";

// WhatsApp's "Tap to return to call" strip: a slim green bar across the very top
// while a call runs in the background. The rest of the app moves down beneath
// it (via --call-bar) so nothing is covered.
const CallReturnBar = ({ onClick, detail, video = false }) => {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--call-bar", "calc(30px + env(safe-area-inset-top))");
    return () => root.style.removeProperty("--call-bar");
  }, []);
  const Icon = video ? Video : Phone;
  return (
    <button
      onClick={onClick}
      className="fixed inset-x-0 top-0 z-[210] bg-[#1FA855] text-white flex items-center justify-center gap-2 text-[13.5px] font-medium active:bg-[#1a9249]"
      style={{ height: "calc(30px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
    >
      <Icon size={14} />
      <span>Tap to return to call</span>
      {detail && <span className="opacity-90">· {detail}</span>}
    </button>
  );
};

export default CallReturnBar;
