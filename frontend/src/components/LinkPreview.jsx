import { useEffect, useState } from "react";
import { axiosInstance } from "../lib/axios";

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const cache = new Map(); // url -> data | null (this session)
const pending = new Map();

export const firstLink = (text) => {
  const m = text && String(text).match(URL_RE);
  return m ? m[0].replace(/[.,;:!?)\]]+$/, "") : null;
};

const load = (url) => {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (!pending.has(url)) {
    pending.set(
      url,
      axiosInstance
        .get("/messages/link-preview", { params: { url } })
        .then((r) => (r.data?.title || r.data?.image || r.data?.description ? r.data : null))
        .catch(() => null)
        .then((d) => {
          cache.set(url, d);
          pending.delete(url);
          return d;
        })
    );
  }
  return pending.get(url);
};

// WhatsApp-style card shown above a message that contains a web link.
const LinkPreview = ({ url, onLoaded }) => {
  const [data, setData] = useState(() => cache.get(url) || null);
  useEffect(() => {
    let live = true;
    load(url).then((d) => {
      if (live && d) {
        setData(d);
        onLoaded?.();
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  if (!data) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block -mx-1 -mt-0.5 mb-1.5 overflow-hidden rounded-lg bg-black/20 text-left"
    >
      {data.image && <img src={data.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full max-h-40 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
      <div className="px-2.5 py-2">
        {data.title && <p className="text-[12.5px] font-medium leading-snug line-clamp-2">{data.title}</p>}
        {data.description && <p className="text-[11.5px] leading-snug text-wa-text/70 line-clamp-3 mt-0.5">{data.description}</p>}
        <p className="text-[11px] text-wa-text/50 mt-0.5 truncate">{data.site}</p>
      </div>
    </a>
  );
};

export default LinkPreview;
