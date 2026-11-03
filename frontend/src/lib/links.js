import toast from "react-hot-toast";

// Shareable links that open inside the app (they work after signing in, too).
export const postLink = (id) => `${window.location.origin}/post?p=${id}`;
export const highlightLink = (id) => `${window.location.origin}/highlight?h=${id}`;

// Put a link on the clipboard (or open the phone's share sheet when copying isn't possible).
export async function copyLink(url, title = "Talkies") {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else window.prompt("Copy this link", url);
    } catch {
      /* cancelled */
    }
  }
}
