import { useEffect } from "react";
import { useThemeStore, isDarkTheme } from "../store/useThemeStore";

// Paints the phone's status / navigation bar (browser theme-color + the Android app's bars).
function paint(color, dark) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  try {
    window.Capacitor?.Plugins?.SystemBars?.setStyle?.({ style: dark ? "DARK" : "LIGHT" });
  } catch {
    /* not in the app */
  }
  try {
    window.Capacitor?.Plugins?.AppChrome?.setTheme?.({ color, dark })?.catch?.(() => {});
  } catch {
    /* not in the app */
  }
}

// Full-screen screens (like WhatsApp's status editor) take over the bars while they are open,
// and hand them back to the current theme when they close.
export function useStatusBarColor(color, dark = true) {
  useEffect(() => {
    paint(color, dark);
  }, [color, dark]);

  useEffect(
    () => () => {
      const themeIsDark = isDarkTheme(useThemeStore.getState().theme);
      paint(themeIsDark ? "#111B21" : "#FFFFFF", themeIsDark);
    },
    []
  );
}
