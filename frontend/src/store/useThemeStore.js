import { create } from "zustand";

// Bright (white) is the default; the person can pick any theme in Settings.
export const DARK_THEMES = ["dark", "night", "dracula", "forest", "business", "luxury", "black", "synthwave"];
export const isDarkTheme = (t) => DARK_THEMES.includes(t);

const read = () => {
  try {
    return localStorage.getItem("chat-theme") || "light";
  } catch {
    return "light";
  }
};

// Puts the theme on <html> (our colour tokens + the browser/phone bar colour).
export function applyTheme(theme) {
  const dark = isDarkTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("wa-dark", dark);
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#111B21" : "#FFFFFF");
  // Android app: make the status/navigation bar icons readable on this theme.
  try {
    window.Capacitor?.Plugins?.SystemBars?.setStyle?.({ style: dark ? "DARK" : "LIGHT" });
  } catch {
    /* not in the app */
  }
  // Android app: bars + the strip behind them take the theme colour (dark theme -> dark bars)
  try {
    window.Capacitor?.Plugins?.AppChrome?.setTheme?.({ color: dark ? "#111B21" : "#FFFFFF", dark })?.catch?.(() => {});
  } catch {
    /* not in the app */
  }
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute("content", dark ? "dark" : "light");
}

export const useThemeStore = create((set) => ({
  theme: read(),
  setTheme: (theme) => {
    try {
      localStorage.setItem("chat-theme", theme);
    } catch {
      /* private mode */
    }
    applyTheme(theme);
    set({ theme });
  },
}));
