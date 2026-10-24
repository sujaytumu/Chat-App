// "Live location" message: a position that keeps moving for 15 min / 1 hour / 8 hours, then stops by itself.
export const LIVE_MINUTES = [15, 60, 480];

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Cleans the first position + duration that comes from the client.
export function sanitizeLiveLocation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = num(raw.lat, -90, 90);
  const lng = num(raw.lng, -180, 180);
  const minutes = LIVE_MINUTES.includes(Number(raw.minutes)) ? Number(raw.minutes) : null;
  if (lat === null || lng === null || !minutes) return null;
  const now = new Date();
  return {
    lat,
    lng,
    accuracy: num(raw.accuracy, 0, 100000) ?? undefined,
    comment: typeof raw.comment === "string" ? raw.comment.replace(/\s+/g, " ").trim().slice(0, 200) || undefined : undefined,
    startedAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + minutes * 60_000),
    active: true,
  };
}

export const cleanPosition = (raw) => {
  const lat = num(raw?.lat, -90, 90);
  const lng = num(raw?.lng, -180, 180);
  if (lat === null || lng === null) return null;
  return { lat, lng, accuracy: num(raw?.accuracy, 0, 100000) ?? undefined };
};
