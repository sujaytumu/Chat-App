// Moving between the main tabs (Chats / Updates / Calls / You) never stacks
// history: Back from any tab returns to Chats, and Back on Chats leaves — like
// WhatsApp. (Going "to Chats" from another tab just steps back to it.)
export function goTab(navigate, from, to) {
  if (from === to) return;
  if (to === "/" && (window.history.state?.idx ?? 0) > 0) {
    navigate(-1);
    return;
  }
  navigate(to, { replace: from !== "/" });
}
