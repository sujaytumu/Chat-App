// "Ravi is typing…" / "Ravi and Sam are typing…" / "3 people are typing…" for a group.
export function groupTypingLabel(typingSet, members = [], short = false) {
  const ids = Array.from(typingSet || []);
  if (!ids.length) return "";
  const names = ids.map((id) => (members.find((m) => String(m._id || m) === String(id))?.fullName || "Someone").split(" ")[0]);
  if (short) return ids.length === 1 ? `${names[0]}: typing…` : `${ids.length} people typing…`;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
