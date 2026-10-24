import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Navigation } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { liveShares } from "../lib/liveShare";
import { useChatStore } from "../store/useChatStore";

const MIN_GAP = 10_000; // never send more often than every 10 s
const MAX_GAP = 60_000; // but always at least once a minute so "updated" stays fresh
const MIN_MOVE_M = 8;

const metres = (a, b) => {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const stopLiveShare = async (id) => {
  liveShares.remove(id);
  try {
    const res = await axiosInstance.put(`/messages/live-location/${id}/stop`);
    useChatStore.setState((s) => ({ messages: s.messages.map((m) => (m._id === id ? { ...m, liveLocation: res.data.liveLocation } : m)) }));
  } catch {
    /* already ended or offline: the card still shows it as ended once it expires */
  }
};

// Keeps my live-location messages moving. Runs only while at least one is active; a plain browser
// geolocation watch, so it needs no native plugin and cannot break the Android app.
const LiveLocationManager = () => {
  const [count, setCount] = useState(() => liveShares.list().length);
  const last = useRef({ at: 0, pos: null });

  useEffect(() => liveShares.subscribe(() => setCount(liveShares.list().length)), []);

  useEffect(() => {
    if (!count || !navigator.geolocation) return;
    let watchId = null;
    let stopped = false;

    const push = async (pos) => {
      const now = Date.now();
      const prev = last.current;
      const moved = prev.pos ? metres(prev.pos, pos) : Infinity;
      if (now - prev.at < MIN_GAP) return;
      if (now - prev.at < MAX_GAP && moved < MIN_MOVE_M) return;
      last.current = { at: now, pos };
      for (const s of liveShares.list()) {
        try {
          const res = await axiosInstance.put(`/messages/live-location/${s.id}`, pos);
          const live = res.data?.liveLocation;
          if (live) useChatStore.setState((st) => ({ messages: st.messages.map((m) => (m._id === s.id ? { ...m, liveLocation: live } : m)) }));
          if (live && !live.active) liveShares.remove(s.id);
        } catch (e) {
          if ([403, 404].includes(e?.response?.status)) liveShares.remove(s.id); // deleted or not mine any more
        }
      }
    };

    const start = () => {
      if (stopped || watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (p) => push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => {
          if (err?.code === 1) {
            toast.error("Location permission is off, so live location stopped");
            liveShares.list().forEach((s) => stopLiveShare(s.id));
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
      );
    };
    const halt = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    // coming back to the app: restart the watch (the phone may have paused it) and send a fresh point
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      halt();
      last.current = { at: 0, pos: null };
      start();
    };

    start();
    document.addEventListener("visibilitychange", onVisible);
    // end shares that ran out of time
    const timer = setInterval(() => {
      liveShares.expired().forEach((s) => stopLiveShare(s.id));
      liveShares.prune();
    }, 15000);

    return () => {
      stopped = true;
      halt();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [count]);

  if (!count) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[140] top-[calc(8px+env(safe-area-inset-top))] flex items-center gap-2 pl-3 pr-1.5 h-9 rounded-full bg-[#F15C6D] text-white text-[12.5px] font-medium shadow-lg">
      <Navigation size={14} />
      Sharing live location
      <button
        type="button"
        onClick={() => liveShares.list().forEach((s) => stopLiveShare(s.id))}
        className="h-6 px-2.5 rounded-full bg-white/25 active:bg-white/40"
      >
        Stop
      </button>
    </div>
  );
};

export default LiveLocationManager;
