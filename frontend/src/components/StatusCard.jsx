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

// Portrait status card like WhatsApp's Updates tab: the update as the background, round photo with a ring on top, name at the bottom.
const StatusCard = ({ user, status, name, ring = "new", plus = false, muted = false, onClick, onPlus, ...rest }) => {
  const pv = statusPreview(status);
  const ringColor = ring === "new" ? "#21C063" : ring === "seen" ? "rgba(255,255,255,.45)" : "transparent";
  return (
    <button
      onClick={onClick}
      className={`shrink-0 relative w-[114px] h-[200px] rounded-[26px] overflow-hidden text-left select-none active:scale-[.97] transition-transform bg-wa-surface ${muted ? "opacity-60" : ""}`}
      {...rest}
    >
      {pv.kind === "image" && <img src={pv.src} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />}
      {pv.kind === "text" && (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[13px] font-semibold leading-snug text-white overflow-hidden" style={{ background: pv.color }}>
          <span className="line-clamp-5 break-words">{pv.text}</span>
        </div>
      )}
      {pv.kind === "none" && <div className="absolute inset-0 bg-gradient-to-br from-[#1f3a34] to-[#0f1b22]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/70" />
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2">
        <img
          src={optimizeImage(user?.profilePic, 120) || "/avatar.png"}
          alt=""
          draggable={false}
          className="size-[52px] rounded-full object-cover border-2 border-black/40"
          style={{ boxShadow: ring === "none" ? "none" : `0 0 0 3px ${ringColor}` }}
        />
        {plus && (
          <span
            onClick={(e) => { e.stopPropagation(); onPlus?.(); }}
            className="absolute -bottom-1 -right-1.5 size-6 rounded-full bg-[#21C063] border-2 border-[#101820] flex items-center justify-center text-white text-[18px] leading-none font-medium"
            role="button"
            aria-label="Add status"
          >+</span>
        )}
      </div>
      <p className="absolute bottom-3 left-3 right-2.5 text-[14.5px] font-medium leading-tight text-white line-clamp-2 break-words" style={{ textShadow: "0 1px 4px rgba(0,0,0,.7)" }}>{name}</p>
    </button>
  );
};

export default StatusCard;
