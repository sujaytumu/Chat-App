import toast from "react-hot-toast";

// The owner's "<name> is requesting access" popups, one per waiting person. They stay until the request is
// answered (from any device) or the owner opens "Who can see whom", where the list itself shows them.
const open = new Map(); // userId -> toast id

export const hasAccessPopup = (userId) => open.has(String(userId));
export const rememberAccessPopup = (userId, toastId) => open.set(String(userId), toastId);
export const closeAccessPopup = (userId) => {
  const id = open.get(String(userId));
  if (id) toast.dismiss(id);
  open.delete(String(userId));
};
export const closeAllAccessPopups = () => {
  open.forEach((id) => toast.dismiss(id));
  open.clear();
};
export const openAccessPopupIds = () => [...open.keys()];
