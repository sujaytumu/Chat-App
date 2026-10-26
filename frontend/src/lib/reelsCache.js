import { axiosInstance } from "./axios";

// Keeps the first few "For you" reels on the phone so Reels opens instantly,
// then the page refreshes them from the server in the background.
const KEY = "reelsFirstPageV1";
const MAX_AGE = 6 * 60 * 60 * 1000;

export const readReelsCache = () => {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    return c && Array.isArray(c.reels) && c.reels.length && Date.now() - c.at < MAX_AGE ? c.reels : null;
  } catch {
    return null;
  }
};

export const writeReelsCache = (reels) => {
  try {
    const keep = reels.filter((r) => r && r._id && !r._pinned).slice(0, 6);
    if (keep.length) localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), reels: keep }));
  } catch {
    /* storage full or blocked: skip */
  }
};

// Called once after sign-in so the cache is ready before the person opens Reels.
export const warmReels = async () => {
  try {
    const { data } = await axiosInstance.get("/reels", { params: { tab: "foryou" }, timeout: 20000 });
    writeReelsCache(data.reels || []);
  } catch {
    /* the Reels page will load normally */
  }
};
