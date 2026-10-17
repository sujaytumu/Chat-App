import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_THEMES, CHAT_FONTS, themeStyle, getTheme, getFont, loadChatFont } from "../lib/chatThemes";
import { useChatThemeStore } from "../store/useChatThemeStore";
import { useBackToClose } from "../lib/useBackToClose";

// Instagram-style "Customise" sheet for ONE chat: a Theme tab (wallpaper + bubble colours)
// and a Font tab, with Preview (try it on the real chat) and Apply.
const RING = "#4f5bff";
const W = 360; // thumbnails are drawn at phone size, then scaled down to the card

const ThemeCard = ({ theme, scale, selected, onPick, label, sub }) => (
  <button onClick={onPick} className="flex flex-col gap-1.5 text-left" aria-pressed={selected}>
    <span
      className="relative block w-full rounded-2xl overflow-hidden"
      style={{ aspectRatio: "9 / 16", outline: selected ? `2.5px solid ${RING}` : "1px solid rgb(255 255 255 / .1)", outlineOffset: selected ? "-1px" : 0, background: theme ? undefined : "#1b2429" }}
    >
      {theme ? (
        <span className="absolute left-0 top-0 block" style={{ width: W, height: (W * 16) / 9, transform: `scale(${scale})`, transformOrigin: "0 0", ...themeStyle(theme) }}>
          {/* two sample bubbles so the colours are visible on the card */}
          <span className="absolute left-[26px] top-[250px] h-[54px] w-[150px] rounded-3xl" style={{ background: `rgb(${theme.inn.join(" ")})` }} />
          <span className="absolute right-[26px] top-[320px] h-[54px] w-[170px] rounded-3xl" style={{ background: `rgb(${theme.out.join(" ")})` }} />
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[13px] text-white/70 text-center px-2">{sub || "Default"}</span>
      )}
    </span>
    <span className="text-[13.5px] leading-tight" style={{ color: selected ? RING : "rgb(var(--wa-text))" }}>
      {theme ? theme.name : label || "Default"}
    </span>
  </button>
);

const ChatThemeSheet = ({ scope = "default", chatName, onClose }) => {
  const isDefault = scope === "default";
  useBackToClose(true, onClose);
  const saved = useChatThemeStore((s) => (isDefault ? s.def : s.chats[scope]));
  const applyStore = useChatThemeStore((s) => s.apply);
  const setPreview = useChatThemeStore((s) => s.setPreview);

  const [tab, setTab] = useState("theme");
  const [theme, setTheme] = useState(saved?.theme || null);
  const [font, setFont] = useState(saved?.font || null);
  const [previewing, setPreviewing] = useState(false);
  const gridRef = useRef(null);
  const [scale, setScale] = useState(0.27);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setScale(((el.clientWidth - 24) / 3) / W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  // fonts show their own name, so fetch them once the Font tab opens
  useEffect(() => {
    if (tab === "font") CHAT_FONTS.forEach(loadChatFont);
  }, [tab]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const changed = (theme || null) !== (saved?.theme || null) || (font || null) !== (saved?.font || null);

  const doPreview = () => {
    loadChatFont(getFont(font));
    setPreview({ scope, theme, font });
    setPreviewing(true);
  };
  const doApply = () => {
    applyStore(scope, theme, font);
    onClose();
  };
  const stopPreview = () => {
    setPreview(null);
    setPreviewing(false);
  };

  if (previewing) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[125] wa-dark flex justify-center pb-[calc(14px+env(safe-area-inset-bottom))] px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-3xl bg-wa-panel text-wa-text shadow-2xl p-3 flex items-center gap-3">
          <span className="flex-1 pl-2 text-[14px] truncate">Previewing {getTheme(theme)?.name || (theme === "none" ? "Plain" : "Default")}</span>
          <button onClick={stopPreview} className="h-10 px-5 rounded-full bg-wa-surface text-[14px] font-medium">Back</button>
          <button onClick={doApply} className="h-10 px-6 rounded-full text-[14px] font-medium text-white" style={{ background: RING }}>Apply</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[125] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="wa-dark w-full max-w-md h-[88vh] bg-wa-panel text-wa-text rounded-t-[28px] flex flex-col pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/30" />
        <h3 className="text-center text-[17px] font-semibold pt-5 pb-3">{isDefault ? "Theme for all chats" : "Customise"}</h3>
        <div className="flex border-b border-white/10">
          {[["theme", "Theme"], ["font", "Font"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex-1 pb-3 text-[16px] font-medium relative ${tab === id ? "text-wa-text" : "text-wa-muted"}`}>
              {label}
              {tab === id && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] w-24 rounded-full bg-white" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-3 no-scrollbar">
          {tab === "theme" ? (
            <div ref={gridRef} className="grid grid-cols-3 gap-x-3 gap-y-4">
              <ThemeCard theme={null} scale={scale} selected={!theme} onPick={() => setTheme(null)} label={isDefault ? "Plain" : "Same as all chats"} sub={isDefault ? "Plain" : "All chats"} />
              {!isDefault && <ThemeCard theme={null} scale={scale} selected={theme === "none"} onPick={() => setTheme("none")} label="Plain" sub="Plain" />}
              {CHAT_THEMES.map((t) => (
                <ThemeCard key={t.id} theme={t} scale={scale} selected={theme === t.id} onPick={() => setTheme(t.id)} />
              ))}
            </div>
          ) : (
            <>
              <p className="text-center text-[14px] text-wa-muted mb-4">{isDefault ? "Pick a font for messages in all chats." : `Pick a font for messages in ${chatName}.`}</p>
              <div className="grid grid-cols-2 gap-3">
                {!isDefault && (
                  <button onClick={() => setFont(null)} className="h-[104px] rounded-3xl bg-wa-surface flex items-center justify-center text-[17px] text-center px-3" style={{ outline: !font ? `2.5px solid ${RING}` : "none" }} aria-pressed={!font}>
                    Same as all chats
                  </button>
                )}
                {CHAT_FONTS.map((f) => {
                  const on = isDefault ? (font || "default") === f.id : f.id === "default" ? font === "none" : font === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFont(f.id === "default" ? (isDefault ? null : "none") : f.id)}
                      className="h-[104px] rounded-3xl bg-wa-surface flex items-center justify-center text-[30px]"
                      style={{ fontFamily: f.css || "inherit", fontWeight: f.weight || 400, outline: on ? `2.5px solid ${RING}` : "none" }}
                      aria-pressed={on}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-4 pt-2 pb-4">
          <button onClick={doPreview} className="flex-1 h-14 rounded-2xl bg-wa-surface text-[16px] font-semibold">Preview</button>
          <button onClick={doApply} disabled={!changed} className="flex-1 h-14 rounded-2xl text-[16px] font-semibold text-white disabled:opacity-40" style={{ background: RING }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatThemeSheet;
