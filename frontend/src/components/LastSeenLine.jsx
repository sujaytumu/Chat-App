import { useEffect, useRef, useState } from "react";

// WhatsApp's "last seen today at 22:49": shown in full first, then the words
// slowly slide off to the left until only the time is left.
const LastSeenLine = ({ text }) => {
  const m = text.match(/^(.*\sat\s)(\d{1,2}:\d{2})$/);
  const prefixRef = useRef(null);
  const [shift, setShift] = useState(0);
  const [slide, setSlide] = useState(false);

  useEffect(() => {
    setSlide(false);
    setShift(0);
    if (!m) return;
    const measure = setTimeout(() => setShift(prefixRef.current?.offsetWidth || 0), 50);
    const go = setTimeout(() => setSlide(true), 2500);
    return () => {
      clearTimeout(measure);
      clearTimeout(go);
    };
  }, [text]); // eslint-disable-line

  if (!m) return <span>{text}</span>;
  return (
    <span className="block overflow-hidden whitespace-nowrap">
      <span
        className="inline-block"
        style={{
          transform: slide ? `translateX(-${shift}px)` : "none",
          transition: slide ? "transform 2.2s ease-in-out" : "none",
        }}
      >
        <span ref={prefixRef}>{m[1]}</span>
        <span>{m[2]}</span>
      </span>
    </span>
  );
};

export default LastSeenLine;
