// Shows the part of a message around the match, with the match highlighted.
const SearchSnippet = ({ text, query, className = "" }) => {
  const q = (query || "").trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <span className={className}>{text.slice(0, 90)}</span>;
  const start = Math.max(0, i - 28);
  const before = (start > 0 ? "…" : "") + text.slice(start, i);
  const match = text.slice(i, i + q.length);
  const after = text.slice(i + q.length, i + q.length + 60) + (i + q.length + 60 < text.length ? "…" : "");
  return (
    <span className={className}>
      {before}
      <mark className="bg-transparent text-[#25D366] font-semibold">{match}</mark>
      {after}
    </span>
  );
};

export default SearchSnippet;
