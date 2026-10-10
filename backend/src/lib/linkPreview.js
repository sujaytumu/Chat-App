import dns from "node:dns/promises";
import net from "node:net";

const cache = new Map(); // url -> { at, data }
const TTL = 6 * 3600 * 1000;

const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224 || (a === 100 && b >= 64 && b <= 127);
};

const safeUrl = async (raw) => {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (net.isIP(u.hostname)) return isPrivateIp(u.hostname) ? null : u;
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
  } catch {
    return null;
  }
  return u;
};

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const meta = (html, keys) => {
  for (const k of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m && m[1]) return decode(m[1]);
  }
  return "";
};

export const getLinkPreview = async (raw) => {
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let data = null;
  const url = await safeUrl(raw);
  if (url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; TalkiesBot/1.0; link preview)", accept: "text/html" },
      });
      clearTimeout(timer);
      const type = res.headers.get("content-type") || "";
      if (res.ok && /text\/html/i.test(type) && (await safeUrl(res.url))) {
        // read only the first ~300 KB — the tags we need are in <head>
        const reader = res.body.getReader();
        let html = "";
        const dec = new TextDecoder();
        while (html.length < 300000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += dec.decode(value, { stream: true });
          if (/<\/head>/i.test(html)) break;
        }
        reader.cancel().catch(() => {});
        const title = meta(html, ["og:title", "twitter:title"]) || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
        const description = meta(html, ["og:description", "twitter:description", "description"]);
        let image = meta(html, ["og:image", "og:image:url", "twitter:image"]);
        if (image) {
          try {
            image = new URL(image, res.url).href;
          } catch {
            image = "";
          }
        }
        const site = meta(html, ["og:site_name"]) || url.hostname.replace(/^www\./, "");
        if (title || description || image) {
          data = { url: raw, title: title.slice(0, 140), description: description.slice(0, 220), image, site };
        }
      }
    } catch {
      /* no preview */
    }
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(raw, { at: Date.now(), data });
  return data;
};
