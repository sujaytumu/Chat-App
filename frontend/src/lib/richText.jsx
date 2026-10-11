import { Fragment } from "react";

// WhatsApp-style text formatting: *bold*  _italic_  ~strikethrough~  `mono`  ```block```
// plus tappable web links.
const LINK = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/;
const MARK = /(^|[\s([{>])([*_~])(?=\S)([\s\S]*?\S)\2(?=$|[\s)\]}.,!?:;<])/;

const inline = (text, base) => {
  const out = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = rest.match(MARK);
    if (!m) break;
    const idx = m.index + m[1].length; // where the marker starts
    if (idx > 0) out.push(...links(rest.slice(0, idx), `${base}t${n++}`));
    const inner = inline(m[3], `${base}i${n}`);
    const key = `${base}m${n++}`;
    out.push(
      m[2] === "*" ? <strong key={key}>{inner}</strong> : m[2] === "_" ? <em key={key}>{inner}</em> : <s key={key}>{inner}</s>
    );
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(...links(rest, `${base}e`));
  return out;
};

const links = (text, base) =>
  text.split(LINK).map((part, i) =>
    /^https?:\/\//i.test(part) ? (
      <a
        key={`${base}l${i}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline text-[#53BDEB] break-all"
      >
        {part}
      </a>
    ) : (
      <Fragment key={`${base}s${i}`}>{part}</Fragment>
    )
  );

function formatRaw(text) {
  if (!text) return text;
  // fast path: nothing special in the message
  if (!/[*_~`]|https?:\/\//i.test(text)) return text;
  const out = [];
  const parts = String(text).split(/(```[\s\S]+?```|`[^`\n]+`)/g);
  parts.forEach((p, i) => {
    if (p.startsWith("```") && p.endsWith("```") && p.length > 6) {
      out.push(
        <code key={`b${i}`} className="block my-0.5 px-2 py-1 rounded bg-black/15 font-mono text-[0.92em] whitespace-pre-wrap break-words">
          {p.slice(3, -3).replace(/^\n/, "")}
        </code>
      );
    } else if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) {
      out.push(
        <code key={`c${i}`} className="px-1 rounded bg-black/15 font-mono text-[0.92em]">
          {p.slice(1, -1)}
        </code>
      );
    } else if (p) {
      out.push(...inline(p, `p${i}`));
    }
  });
  return out;
}

// Chat lists re-render often; formatting the same text again and again is
// wasted work, so remember the result (React elements are immutable, so reuse is safe).
const cache = new Map();
export function renderFormatted(text) {
  if (!text || typeof text !== "string") return text;
  if (!/[*_~`]|https?:\/\//i.test(text)) return text;
  const hit = cache.get(text);
  if (hit) return hit;
  const out = formatRaw(text);
  cache.set(text, out);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return out;
}
