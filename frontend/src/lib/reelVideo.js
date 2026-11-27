// Reel videos are uploaded at the phone's full size (often 1080p/4K, huge bitrate). Cloudinary can hand back a
// phone-friendly copy of the same file: H.264 MP4, at most 720 px wide, with automatic quality. That is several
// times smaller, so it starts sooner and does not stutter on slow networks. If that copy ever fails to load, the
// player falls back to the original file (see useReelSource), so a reel can never get worse than before.
const CLD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(?!.*(?:^|[,/])(?:w_|q_|vc_))/;

export const fastVideoUrl = (url) => {
  if (typeof url !== "string" || !CLD.test(url)) return url;
  if (/\/video\/upload\/(?:[a-z]{1,3}_[^/]*\/)/.test(url)) return url; // already has a transformation: leave it
  return url.replace("/video/upload/", "/video/upload/f_mp4,vc_h264,q_auto:good,c_limit,w_720/").replace(/\.[A-Za-z0-9]+(\?.*)?$/, ".mp4$1");
};

// Asks the network for the first part of a video so it is already close when the person swipes to it.
const warmed = new Set();
export const warmVideo = (url) => {
  try {
    const u = fastVideoUrl(url);
    if (!u || warmed.has(u) || warmed.size > 40) return;
    warmed.add(u);
    fetch(u, { mode: "no-cors", headers: { Range: "bytes=0-524287" } }).catch(() => {});
  } catch {
    /* warming is only a bonus */
  }
};
