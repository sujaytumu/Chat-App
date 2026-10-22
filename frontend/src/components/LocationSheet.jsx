import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LocateFixed, MapPin, Navigation, Send, Store } from "lucide-react";
import { useBackToClose } from "../lib/useBackToClose";
import { useAuthStore } from "../store/useAuthStore";
import MapThumb from "./MapThumb";

const toRad = (d) => (d * Math.PI) / 180;
const meters = (a, b) => {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const far = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

// Nearby named places from OpenStreetMap (Overpass). Best effort: the list just stays empty if it can't load.
async function fetchNearby(p, signal) {
  const q = `[out:json][timeout:10];nwr(around:400,${p.lat},${p.lng})["name"]["amenity"~"restaurant|cafe|fast_food|bank|pharmacy|hospital|school|college|place_of_worship|cinema|bar|fuel"];out center 12;`;
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { signal });
  const json = await res.json();
  return (json.elements || [])
    .map((e) => ({ name: e.tags?.name, kind: (e.tags?.amenity || "").replace(/_/g, " "), lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
    .filter((e) => e.name && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .map((e) => ({ ...e, d: meters(p, e) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10);
}

// WhatsApp-style "Send location" page: map, share live, nearby places, send current location.
const LocationSheet = ({ allowLive = true, onCurrent, onPlace, onLive, onClose }) => {
  const authUser = useAuthStore((s) => s.authUser);
  const [pos, setPos] = useState(null);
  const [error, setError] = useState("");
  const [places, setPlaces] = useState([]);
  const [live, setLive] = useState(false);
  const [mins, setMins] = useState(15);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const watchRef = useRef(null);

  useBackToClose(true, () => (live ? setLive(false) : onClose()));

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Location isn't available here");
      return undefined;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setError("Couldn't get your location — check location permission"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const base = useRef(null);
  useEffect(() => {
    if (!pos) return undefined;
    // look up places once, and again only after moving a good way
    if (base.current && meters(base.current, pos) < 150) return undefined;
    base.current = pos;
    const ctrl = new AbortController();
    fetchNearby(pos, ctrl.signal).then(setPlaces).catch(() => {});
    return () => ctrl.abort();
  }, [pos]);

  const run = async (fn) => {
    if (busy || !pos) return;
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const acc = pos?.accuracy ? Math.max(1, Math.round(pos.accuracy)) : null;

  return createPortal(
    <div className="wa-dark fixed inset-0 z-[160] bg-wa-bg text-wa-text flex flex-col">
      <header className="flex items-center gap-3 px-3 h-14 shrink-0 bg-wa-panel pt-[env(safe-area-inset-top)] box-content">
        <button onClick={live ? () => setLive(false) : onClose} aria-label="Back" className="size-10 flex items-center justify-center rounded-full active:bg-white/10">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-[18px] font-medium">{live ? "Share live location" : "Send location"}</h2>
      </header>

      <div className="relative shrink-0">
        {pos ? (
          <MapThumb lat={pos.lat} lng={pos.lng} zoom={live ? 17 : 16} height={live ? 300 : 230} marker={live ? "avatar" : "dot"} avatar={authUser?.profilePic} name={authUser?.fullName} className="w-full" />
        ) : (
          <div className="h-[230px] bg-wa-panel flex items-center justify-center text-wa-muted text-[14px] px-6 text-center">{error || "Finding your location…"}</div>
        )}
        {pos && !live && (
          <span className="absolute right-3 bottom-3 size-11 rounded-full bg-wa-panel shadow-lg flex items-center justify-center text-wa-text">
            <LocateFixed size={21} />
          </span>
        )}
      </div>

      {live ? (
        <div className="flex-1 flex flex-col px-4 pt-5">
          <p className="text-[14px] text-wa-muted">Share live location for</p>
          <div className="mt-3 flex gap-2.5">
            {[
              [15, "15 minutes"],
              [60, "1 hour"],
              [480, "8 hours"],
            ].map(([m, label]) => (
              <button key={m} onClick={() => setMins(m)} className={`flex-1 h-10 rounded-lg text-[13.5px] font-medium border transition-colors ${mins === m ? "border-[#25D366] text-[#25D366] bg-[#25D366]/10" : "border-white/15 text-wa-text/80"}`}>
                {label}
              </button>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder="Add comment" className="mt-6 w-full bg-transparent border-0 border-b border-white/25 focus:border-[#25D366] outline-none py-2 text-[15px] placeholder:text-wa-muted" />
          <p className="mt-4 text-[12.5px] text-wa-muted">Updates while Talkies is open. You can stop sharing any time.</p>
          <div className="flex-1" />
          <div className="flex justify-end pb-[calc(20px+env(safe-area-inset-bottom))]">
            <button disabled={!pos || busy} onClick={() => run(() => onLive(mins, pos, comment))} aria-label="Start sharing" className="size-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg disabled:opacity-50 active:scale-95 transition-transform">
              <Send size={22} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {allowLive && (
            <button onClick={() => setLive(true)} disabled={!pos} className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 text-left disabled:opacity-50">
              <span className="size-11 rounded-full bg-[#25D366] text-white flex items-center justify-center">
                <Navigation size={20} />
              </span>
              <span className="text-[15.5px] font-medium">Share live location</span>
            </button>
          )}
          <p className="px-4 pt-3 pb-1 text-[13px] text-wa-muted">Nearby places</p>
          {places.map((pl, i) => (
            <button key={`${pl.name}-${i}`} onClick={() => run(() => onPlace(pl))} className="w-full flex items-center gap-4 px-4 py-2.5 active:bg-white/5 text-left">
              <span className="size-11 rounded-full bg-wa-field flex items-center justify-center text-wa-muted shrink-0">
                <Store size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] truncate">{pl.name}</span>
                <span className="block text-[12.5px] text-wa-muted capitalize truncate">
                  {far(pl.d)}
                  {pl.kind ? ` · ${pl.kind}` : ""}
                </span>
              </span>
            </button>
          ))}
          {pos && !places.length && <p className="px-4 py-2 text-[13px] text-wa-muted">No places found nearby</p>}
        </div>
      )}

      {!live && (
        <button disabled={!pos || busy} onClick={() => run(() => onCurrent(pos))} className="shrink-0 w-full flex items-center gap-4 px-4 py-3.5 bg-wa-panel border-t border-white/10 active:bg-white/5 text-left disabled:opacity-50 pb-[calc(14px+env(safe-area-inset-bottom))]">
          <span className="size-11 rounded-full bg-[#25D366] text-white flex items-center justify-center">
            <MapPin size={21} />
          </span>
          <span>
            <span className="block text-[15.5px] font-medium">Send your current location</span>
            <span className="block text-[12.5px] text-wa-muted">{acc ? `Accurate to ${acc} meters` : "Finding your location…"}</span>
          </span>
        </button>
      )}
    </div>,
    document.body
  );
};

export default LocationSheet;
