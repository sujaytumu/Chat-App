export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// WhatsApp-style date divider: "Today" / "Yesterday" / short weekday name
// for the past week (e.g. "Sat") / dd/mm/yyyy beyond that.
export function formatDateDivider(date) {
  const d = new Date(date);
  const now = new Date();

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// True when two timestamps fall on different calendar days — used to decide
// where to insert a date divider between messages.
export function isDifferentDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  );
}
