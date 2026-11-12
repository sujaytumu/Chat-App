// Validates a poll sent from the client: a question plus 2–12 distinct options.
export function sanitizePoll(raw) {
  if (!raw || typeof raw !== "object") return null;
  const question = String(raw.question || "").trim().slice(0, 200);
  const free = raw.kind === "free"; // "When are we free?": several slots can be ticked, each has a start time
  const seen = new Set();
  const options = [];
  for (const o of Array.isArray(raw.options) ? raw.options : []) {
    const text = String(o?.text ?? o ?? "").trim().slice(0, 100);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    const opt = { text, votes: [] };
    if (free && o?.at) {
      const at = new Date(o.at);
      if (!Number.isNaN(at.getTime())) opt.at = at;
    }
    options.push(opt);
  }
  if (!question || options.length < 2 || options.length > 12) return null;
  return free ? { question, multiple: true, kind: "free", options } : { question, multiple: !!raw.multiple, options };
}
