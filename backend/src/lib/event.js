// An "event" message: title, when, where, and who is going. Cleaned up here because it comes from the client.
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 100);
  const startsAt = new Date(raw.startsAt);
  if (!title || Number.isNaN(startsAt.getTime())) return null;
  return {
    title,
    description: String(raw.description || "").trim().slice(0, 300),
    location: String(raw.location || "").trim().slice(0, 120),
    startsAt,
    going: [],
    maybe: [],
    declined: [],
  };
}
