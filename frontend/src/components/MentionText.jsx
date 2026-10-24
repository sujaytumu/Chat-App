// Message text with @mentions highlighted (blue, like WhatsApp).
const MentionText = ({ text, mentions, members }) => {
  const names = (mentions || [])
    .map((id) => members?.find((m) => String(m._id) === String(id))?.fullName)
    .filter(Boolean);
  if (!names.length) return text;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`(@(?:${names.sort((a, b) => b.length - a.length).map(esc).join("|")}))`, "g");
  return text.split(rx).map((part, i) =>
    i % 2 ? (
      <span key={i} className="text-[#53BDEB] font-medium">
        {part}
      </span>
    ) : (
      part
    )
  );
};

export default MentionText;
