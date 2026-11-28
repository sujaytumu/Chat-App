import { axiosInstance } from "./axios";
import { optimizeImage } from "./cdn";

// The Posts feed, kept ready so the tab opens with photos already on screen:
//  - in memory (with the scroll position) while the app is open,
//  - on this device (first page only) so even a fresh start shows posts at once while the new ones load quietly,
//  - warmFeed() fetches the first page right after sign-in, before the Posts tab is ever opened.
// Photos are asked for at the size this screen needs (not always 1080), so they arrive sooner.
export const POST_W = Math.min(1080, Math.max(480, Math.round((Math.min(typeof window === "undefined" ? 400 : window.innerWidth || 400, 600) * Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2)) / 60) * 60));

const KEY = "talkies-feed-v1";
const MEM_MS = 3 * 60 * 60 * 1000;
let mem = null; // { posts, more, next, scrollTop, at }
let inflight = null;

const readDisk = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    return d && Array.isArray(d.posts) && d.posts.length ? { ...d, scrollTop: 0 } : null;
  } catch {
    return null;
  }
};

export const getFeedCache = () => {
  if (mem && Date.now() - mem.at < MEM_MS) return mem;
  return readDisk(); // older than the in-app copy (or a fresh start): still shown at once, then refreshed
};

export const setFeedCache = (state) => {
  mem = state ? { ...state, at: Date.now() } : null;
  if (!state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ posts: state.posts.slice(0, 16), more: state.more, next: state.next, at: Date.now() }));
  } catch {
    /* storage full or blocked: the in-app copy still works */
  }
};

export const clearFeedCache = () => {
  mem = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export const warmImages = (posts, n = 4) =>
  posts.slice(0, n).forEach((p) => {
    const src = (p.images?.length ? p.images : [p.image])[0];
    if (!src) return;
    const im = new window.Image();
    im.decoding = "async";
    im.src = optimizeImage(src, POST_W);
  });

// Fetch the first page ahead of time (only if nothing fresh is kept yet)
export const warmFeed = () => {
  if (inflight || (mem && Date.now() - mem.at < 60000)) return inflight;
  inflight = axiosInstance
    .get("/posts", { timeout: 20000 })
    .then(({ data }) => {
      if (!data?.posts?.length) return;
      const keepScroll = mem?.scrollTop || 0;
      setFeedCache({ posts: data.posts, more: !!data.more, next: data.next, scrollTop: keepScroll });
      warmImages(data.posts);
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
};
