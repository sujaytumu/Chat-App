import { THEMES } from "../constants";
import { CHAT_COLORS, getChatColor, setChatColor } from "../lib/chatColor";
import { useThemeStore, getThemeAuto, setThemeAuto } from "../store/useThemeStore";
import { Download, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import SettingsShell, { ToggleRow } from "../components/SettingsShell";
import { getWallpaper, setWallpaper } from "../lib/uiSettings";
import { useWallpaperStore } from "../lib/wallpaper";
import ChatThemeSheet from "../components/ChatThemeSheet";
import { useChatThemeStore } from "../store/useChatThemeStore";
import WallpaperPicker from "../components/WallpaperPicker";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import toast from "react-hot-toast";
import { ACCENTS, getAccent, setAccent } from "../lib/accent";
import { APP_FONTS, getAppFont, setAppFont, preloadAllFonts } from "../lib/appFont";

export const InstallAppControl = () => {
  const { isInstalled, promptInstall } = useInstallPrompt();
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("App installed");
    else if (outcome === "unavailable" && isIOS) {
      toast("On iPhone/iPad: tap Share, then 'Add to Home Screen'", { icon: "📲", duration: 5000 });
    } else if (outcome === "unavailable") {
      toast("Look for an install icon in your browser's address bar", { icon: "📲", duration: 5000 });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-wa-surface">
      <div className="flex items-center gap-3">
        {isInstalled ? (
          <CheckCircle2 className="text-[#25D366] shrink-0" size={22} />
        ) : (
          <Download className="text-wa-muted shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Install app</h3>
          <p className="text-xs text-wa-muted">
            {isInstalled
              ? "Already installed — opens like a native app from your home screen."
              : isIOS
              ? "iPhone/iPad: tap Share → Add to Home Screen for the best notification support."
              : "Install for quicker access and more reliable notifications."}
          </p>
        </div>
      </div>
      {!isInstalled && !isIOS && (
        <button
          onClick={handleInstall}
          className="btn btn-sm bg-[#00A884] hover:bg-[#02906f] text-white border-none shrink-0"
        >
          Install
        </button>
      )}
    </div>
  );
};

export const AppearancePage = () => {
  const { theme, setTheme } = useThemeStore();
  const [wallpaper, setWall] = useState(getWallpaper());
  const [picking, setPicking] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const themedChats = useChatThemeStore((s) => Object.keys(s.chats).length);
  const clearThemedChats = useChatThemeStore((s) => s.clearChats);
  const [color, setColor] = useState(getChatColor());
  const [auto, setAuto] = useState(getThemeAuto());
  const chatCount = useWallpaperStore((s) => Object.keys(s.chats).length);
  const clearAllChats = useWallpaperStore((s) => s.clearAllChatWallpapers);

  return (
    <SettingsShell title="Appearance">
      <ToggleRow
        title="Chat wallpaper"
        sub="Show the doodle pattern behind messages"
        checked={wallpaper}
        onChange={(v) => {
          setWall(v);
          setWallpaper(v);
        }}
      />

      <button onClick={() => setPicking(true)} className="w-full text-left p-4 rounded-2xl bg-wa-surface hover:bg-wa-field">
        <span className="block text-[15px] font-medium">Default wallpaper</span>
        <span className="block text-[12.5px] leading-snug text-wa-muted">Used in every chat. To give one chat its own, open it, tap ⋮ and choose Wallpaper.</span>
      </button>
      {chatCount > 0 && (
        <button onClick={clearAllChats} className="w-full text-left p-4 rounded-2xl bg-wa-surface hover:bg-wa-field text-[#F15C6D] text-[13px]">
          Reset {chatCount} chat{chatCount > 1 ? "s" : ""} with their own wallpaper
        </button>
      )}
      {picking && <WallpaperPicker scope="default" onClose={() => setPicking(false)} />}

      <button onClick={() => setThemeOpen(true)} className="w-full text-left p-4 rounded-2xl bg-wa-surface hover:bg-wa-field">
        <span className="block text-[15px] font-medium">Chat theme &amp; font</span>
        <span className="block text-[12.5px] leading-snug text-wa-muted">Used in every chat. To give one chat its own, open it, tap ⋮ and choose Theme &amp; font.</span>
      </button>
      {themedChats > 0 && (
        <button onClick={clearThemedChats} className="w-full text-left p-4 rounded-2xl bg-wa-surface hover:bg-wa-field text-[#F15C6D] text-[13px]">
          Reset {themedChats} chat{themedChats > 1 ? "s" : ""} with their own theme
        </button>
      )}
      {themeOpen && <ChatThemeSheet scope="default" onClose={() => setThemeOpen(false)} />}

      <div className="rounded-2xl bg-wa-surface p-4">
        <span className="block text-[15px] font-medium">Chat colour</span>
        <span className="block text-[12.5px] leading-snug text-wa-muted mb-3">The colour of your own message bubbles</span>
        <div className="flex flex-wrap gap-3">
          {CHAT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setChatColor(c.id);
                setColor(c.id);
              }}
              className="flex flex-col items-center gap-1.5 w-[58px]"
              aria-label={c.name}
              aria-pressed={color === c.id}
            >
              <span
                className={`size-11 rounded-full border-2 flex items-center justify-center transition-transform active:scale-90 ${color === c.id ? "border-[#00A884] scale-105" : "border-black/10"}`}
                style={{ background: c.swatch }}
              >
                {color === c.id && <span className="text-[#00A884] text-[18px] font-bold leading-none">✓</span>}
              </span>
              <span className="text-[10.5px] text-wa-muted truncate w-full text-center">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <AccentCard />

      <FontStyleCard />

      <ToggleRow
        title="Match device"
        sub="Switch between light and dark automatically with your phone or computer"
        checked={auto}
        onChange={(v) => {
          setAuto(v);
          setThemeAuto(v);
        }}
      />

      <div className="flex flex-col gap-1 pt-2">
        <h2 className="text-lg font-semibold">Theme</h2>
        <p className="text-sm text-wa-muted">Choose a theme for your chat interface</p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {THEMES.map((t) => (
          <button
            key={t}
            className={`
              group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
              ${theme === t ? "ring-2 ring-offset-2 ring-offset-wa-bg ring-[#25D366]" : "hover:bg-white/5"}
            `}
            onClick={() => {
              setThemeAuto(false);
              setAuto(false);
              setTheme(t);
            }}
            data-theme={t}
          >
            <div className="relative h-8 w-full rounded-md overflow-hidden">
              <div className="absolute inset-0 grid grid-cols-4 gap-px p-1">
                <div className="rounded bg-primary"></div>
                <div className="rounded bg-secondary"></div>
                <div className="rounded bg-accent"></div>
                <div className="rounded bg-neutral"></div>
              </div>
            </div>
            <span className="text-[9.4px] font-medium truncate w-full text-center">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          </button>
        ))}
      </div>
    </SettingsShell>
  );
};

export default AppearancePage;

function FontStyleCard() {
  const [font, setFont] = useState(getAppFont());
  useEffect(() => {
    preloadAllFonts();
  }, []);
  return (
    <div className="rounded-2xl bg-wa-surface p-4">
      <span className="block text-[15px] font-medium">Font style</span>
      <span className="block text-[12.5px] leading-snug text-wa-muted mb-3">The typeface used across the whole app</span>
      <div className="grid grid-cols-2 gap-2">
        {APP_FONTS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFont(f.id);
              setAppFont(f.id);
            }}
            aria-pressed={font === f.id}
            className={`h-12 px-3 rounded-xl text-left text-[14px] truncate ${font === f.id ? "bg-[#00A884]/20 text-[#00A884] ring-1 ring-[#00A884]" : "bg-wa-field text-wa-text hover:bg-wa-hover"}`}
            style={{ fontFamily: f.css }}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-wa-out px-3 py-2 w-fit ml-auto" style={{ fontFamily: APP_FONTS.find((f) => f.id === font)?.css }}>
        <span className="text-[14px] leading-[21px]">Hey! This is how Talkies will look 👋</span>
      </div>
    </div>
  );
}

function AccentCard() {
  const [accent, setAcc] = useState(getAccent());
  return (
    <div className="rounded-2xl bg-wa-surface p-4">
      <span className="block text-[15px] font-medium">Accent colour</span>
      <span className="block text-[12.5px] leading-snug text-wa-muted mb-3">Buttons, badges, links and highlights across the app</span>
      <div className="flex flex-wrap gap-3">
        {ACCENTS.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setAcc(c.id);
              setAccent(c.id);
            }}
            className="flex flex-col items-center gap-1.5 w-[58px]"
            aria-label={c.name}
            aria-pressed={accent === c.id}
          >
            <span
              className={`size-11 rounded-full flex items-center justify-center text-white text-[18px] font-bold transition-transform active:scale-90 ${accent === c.id ? "ring-2 ring-offset-2 ring-wa-text scale-105" : ""}`}
              style={{ background: `linear-gradient(135deg, ${c.a}, ${c.b})` }}
            >
              {accent === c.id ? "✓" : ""}
            </span>
            <span className="text-[10.5px] text-wa-muted truncate w-full text-center">{c.name.replace("Talkies ", "")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
