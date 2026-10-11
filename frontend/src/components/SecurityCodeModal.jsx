import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";

// A short fingerprint that is identical on both phones for the same pair of people.
// Compare it out loud / in person to be sure you're talking to the right account.
async function fingerprint(a, b) {
  const data = new TextEncoder().encode([a, b].sort().join(":"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const digits = Array.from(hash.slice(0, 30), (x) => String(x % 100).padStart(2, "0")).join("");
  return { groups: digits.match(/.{5}/g), bytes: hash };
}

const SecurityCodeModal = ({ myId, otherId, otherName, onClose }) => {
  useBackToClose(true, onClose);
  const [fp, setFp] = useState(null);
  useEffect(() => {
    fingerprint(myId, otherId).then(setFp).catch(() => setFp(null));
  }, [myId, otherId]);

  // 8x8 symmetric "identicon" drawn from the hash, for a quick visual match.
  const cells = [];
  if (fp) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const on = (fp.bytes[(y * 4 + x) % 32] >> (x % 8)) & 1;
      cells.push([x, y, on], [7 - x, y, on]);
    }
  }
  const hue = fp ? (fp.bytes[0] * 360) / 255 : 160;

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-center justify-center p-5" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-wa-panel text-wa-text shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <ShieldCheck size={22} className="text-[#00A884]" />
          <h3 className="flex-1 text-[16px] font-medium">Verify security code</h3>
          <button onClick={onClose} className="text-wa-muted" aria-label="Close"><X size={22} /></button>
        </div>
        <div className="flex justify-center py-4">
          <svg viewBox="0 0 8 8" className="size-40 rounded-2xl bg-white p-2 shadow-inner" shapeRendering="crispEdges">
            {cells.map(([x, y, on]) => on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={`hsl(${hue} 55% 38%)`} /> : null)}
          </svg>
        </div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 px-6 text-center font-mono text-[17px] tracking-wider tabular-nums">
          {(fp?.groups || Array(12).fill("•••••")).map((g, i) => <span key={i}>{g}</span>)}
        </div>
        <p className="px-6 pt-4 pb-5 text-[12.5px] leading-snug text-wa-muted text-center">
          If the picture and numbers match what {otherName} sees on their phone, you're chatting with the right account.
        </p>
        <button onClick={onClose} className="w-full h-12 text-[14px] font-medium text-[#00A884] border-t border-white/5">Done</button>
      </div>
    </div>
  );
};

export default SecurityCodeModal;
