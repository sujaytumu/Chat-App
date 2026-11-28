// Moving between the main tabs (Chats / Updates / Calls / You) never stacks
// history: Back from any tab returns to Chats, and Back on Chats leaves — like
// WhatsApp. (Going "to Chats" from another tab just steps back to it.)
// The page we were on before this one. Stepping "back" to Chats is only safe when that page really is Chats;
// otherwise Back could land on any older page (that was the random jump), so Chats is opened directly instead.
let prevPath = null;
let curPath = null;
export function notePath(p) {
  if (p === curPath) return;
  prevPath = curPath;
  curPath = p;
}

export function goTab(navigate, from, to) {
  if (from === to) return;
  if (to === "/" && (window.history.state?.idx ?? 0) > 0 && prevPath === "/") {
    navigate(-1);
    return;
  }
  navigate(to, { replace: from !== "/" });
}
