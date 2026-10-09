import { THEMES } from "../constants";
import { useThemeStore } from "../store/useThemeStore";
import { Download, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import SettingsShell, { ToggleRow } from "../components/SettingsShell";
import { getWallpaper, setWallpaper } from "../lib/uiSettings";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import toast from "react-hot-toast";

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
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#1F2C34]">
      <div className="flex items-center gap-3">
        {isInstalled ? (
          <CheckCircle2 className="text-[#25D366] shrink-0" size={22} />
        ) : (
          <Download className="text-[#8696A0] shrink-0" size={22} />
        )}
        <div>
          <h3 className="font-semibold text-sm">Install app</h3>
          <p className="text-xs text-[#8696A0]">
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

      <div className="flex flex-col gap-1 pt-2">
        <h2 className="text-lg font-semibold">Theme</h2>
        <p className="text-sm text-[#8696A0]">Choose a theme for your chat interface</p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {THEMES.map((t) => (
          <button
            key={t}
            className={`
              group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
              ${theme === t ? "ring-2 ring-offset-2 ring-offset-[#0B141A] ring-[#25D366]" : "hover:bg-white/5"}
            `}
            onClick={() => setTheme(t)}
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
            <span className="text-[11px] font-medium truncate w-full text-center">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          </button>
        ))}
      </div>
    </SettingsShell>
  );
};

export default AppearancePage;
