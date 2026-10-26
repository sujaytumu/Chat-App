// Curated public Instagram reels shown in the Reels "For you" feed via Instagram's official embed.
// To add more: paste the link into this list (reel or post link, tracking part after "?" is ignored).
const LINKS = [
  "https://www.instagram.com/reel/DZ-X-N-qmx3/",
  "https://www.instagram.com/reel/DZ6_FG0oOYW/",
  "https://www.instagram.com/reel/DeTHBMnsZJ1/",
  "https://www.instagram.com/reel/DdNlBPTSX9c/",
  "https://www.instagram.com/reel/DeMeE6KtXTk/",
  "https://www.instagram.com/p/DanrybjIWVb/",
  "https://www.instagram.com/reel/DcOtecLtsG6/",
  "https://www.instagram.com/reel/DaBmBVhTo8L/",
];

export const INSTAGRAM_REELS = LINKS.map((u) => {
  const m = u.match(/instagram\.com\/(reel|p)\/([A-Za-z0-9_-]+)/);
  return m ? { path: m[1], code: m[2] } : null;
}).filter(Boolean);
