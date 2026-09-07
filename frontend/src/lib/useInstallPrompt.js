import { useEffect, useState } from "react";

// Captures the browser's native "install this app" prompt (Chrome/Edge/
// Android) so we can trigger it from our own UI instead of waiting for the
// browser's own address-bar icon. iOS Safari never fires this event — there,
// installing is always the manual Share -> Add to Home Screen flow.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia?.("(display-mode: standalone)").matches || false
  );

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome; // "accepted" | "dismissed"
  };

  return { canInstall: !!deferredPrompt, isInstalled, promptInstall };
}
