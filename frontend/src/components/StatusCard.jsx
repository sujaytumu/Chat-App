import { optimizeImage } from "../lib/cdn";

// What a status looks like as a small picture (for the portrait cards on the Updates page)
export const statusPreview = (st) => {
  if (!st) return { kind: "none" };
  if (st.type === "image") return { kind: "image", src: optimizeImage(st.content, 360) };
  if (st.type === "video" && /\/video\/upload\//.test(st.content || "")) {
    // a still frame of the video, made by the picture service (no video is loaded just to draw a card)
    return { kind: "image", src: st.content.replace("/video/upload/", "/video/upload/so_0,w_360,h_640,c_fill,q_auto/").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg") };
  }
  if (st.type === "text") return { kind: "text", color: st.backgroundColor || "#00A884", text: st.content };
  return { kind: "none" };
};

// Portrait status card, sized like WhatsApp's Updates tab (measured from a real screenshot):
// width = 21% of the screen, 9:16 tall, photo ring top-left (68% of the card width, 8% from the edges), name bottom-left.
const StatusCard = ({ user, status, name, ring = "new", plus = false, muted = false, onClick, onPlus, ...rest }) => {
  const pv = statusPreview(status);
  const own = !status && plus; // nothing posted yet: my profile photo fills the card
  const ringColor = ring === "new" ? "#25D366" : ring === "seen" ? "rgba(160,170,178,.75)" : "transparent";
  const photo = optimizeImage(user?.profilePic, 160) || "/avatar.png";
  return (
    <button
      onClick={onClick}
      style={{ width: "clamp(80px, 21.1vw, 116px)", aspectRatio: "9 / 16" }}
      className={`shrink-0 relative rounded-[18px] overflow-hidden text-left select-none active:scale-[.97] transition-transform bg-wa-surface ${muted ? "opacity-60" : ""}`}
      {...rest}
    >
      {pv.kind === "image" && <img src={pv.src} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />}
      {pv.kind === "text" && (
        <div className="absolute inset-0 flex items-center justify-center p-2.5 text-center text-[12px] font-semibold leading-snug text-white overflow-hidden" style={{ background: pv.color }}>
          <span className="line-clamp-5 break-words">{pv.text}</span>
        </div>
      )}
      {pv.kind === "none" && own && <img src={photo} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />}
      {pv.kind === "none" && !own && <div className="absolute inset-0 bg-gradient-to-br from-[#1f3a34] to-[#0f1b22]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/65" />

      {/* photo with ring, top-left */}
      <span className="absolute block rounded-full" style={{ width: "68%", aspectRatio: "1 / 1", top: "8%", left: "8%" }}>
        <span className="block w-full h-full rounded-full p-[2px]" style={{ border: `2.5px solid ${ringColor}` }}>
          <img src={photo} alt="" draggable={false} className="block w-full h-full rounded-full object-cover" />
        </span>
        {plus && (
          <span
            onClick={(e) => { e.stopPropagation(); onPlus?.(); }}
            role="button"
            aria-label="Add status"
            className="absolute flex items-center justify-center rounded-full bg-[#25D366] text-white border-[2.5px] border-[#0b141a] active:scale-90 transition-transform"
            style={{ width: "36%", aspectRatio: "1 / 1", right: "-8%", bottom: "-8%" }}
          >
            <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
        )}
      </span>

      <p className="absolute left-[9%] right-[6%] bottom-[7%] font-medium leading-[1.2] text-white line-clamp-2 break-words" style={{ fontSize: "clamp(11px, 3.3vw, 14.5px)", textShadow: "0 1px 4px rgba(0,0,0,.75)" }}>{name}</p>
    </button>
  );
};

export default StatusCard;
