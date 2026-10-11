// App-wide typeface (Settings → Appearance → Font style). System font costs nothing;
// the others are fetched from Google Fonts only after you pick them.
export const APP_FONTS = [
  { id: "system", name: "System", css: 'system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: "inter", name: "Inter", family: "Inter:wght@400;500;600;700", css: '"Inter", system-ui, sans-serif' },
  { id: "poppins", name: "Poppins", family: "Poppins:wght@400;500;600;700", css: '"Poppins", system-ui, sans-serif' },
  { id: "nunito", name: "Nunito", family: "Nunito:wght@400;500;600;700", css: '"Nunito", system-ui, sans-serif' },
  { id: "dmsans", name: "DM Sans", family: "DM+Sans:wght@400;500;600;700", css: '"DM Sans", system-ui, sans-serif' },
  { id: "manrope", name: "Manrope", family: "Manrope:wght@400;500;600;700", css: '"Manrope", system-ui, sans-serif' },
  { id: "outfit", name: "Outfit", family: "Outfit:wght@400;500;600;700", css: '"Outfit", system-ui, sans-serif' },
  { id: "quicksand", name: "Quicksand", family: "Quicksand:wght@400;500;600;700", css: '"Quicksand", system-ui, sans-serif' },
  { id: "lato", name: "Lato", family: "Lato:wght@400;700", css: '"Lato", system-ui, sans-serif' },
  { id: "opensans", name: "Open Sans", family: "Open+Sans:wght@400;500;600;700", css: '"Open Sans", system-ui, sans-serif' },
  { id: "montserrat", name: "Montserrat", family: "Montserrat:wght@400;500;600;700", css: '"Montserrat", system-ui, sans-serif' },
  { id: "playfair", name: "Playfair (serif)", family: "Playfair+Display:wght@400;500;600;700", css: '"Playfair Display", Georgia, serif' },
  { id: "merriweather", name: "Merriweather (serif)", family: "Merriweather:wght@400;700", css: '"Merriweather", Georgia, serif' },
  { id: "caveat", name: "Caveat (handwritten)", family: "Caveat:wght@400;500;600;700", css: '"Caveat", "Comic Sans MS", cursive' },
  { id: "jetbrains", name: "JetBrains Mono", family: "JetBrains+Mono:wght@400;500;700", css: '"JetBrains Mono", ui-monospace, monospace' },
];

const KEY = "talkies-app-font";

export const getAppFont = () => {
  try {
    const v = localStorage.getItem(KEY);
    return APP_FONTS.some((f) => f.id === v) ? v : "system";
  } catch {
    return "system";
  }
};

const loadFamily = (f) => {
  if (!f?.family || typeof document === "undefined") return;
  const id = `gf-${f.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.family}&display=swap`;
  document.head.appendChild(link);
};

export const applyAppFont = (id = getAppFont()) => {
  const f = APP_FONTS.find((x) => x.id === id) || APP_FONTS[0];
  loadFamily(f);
  const root = document.documentElement;
  if (f.id === "system") root.style.removeProperty("--app-font");
  else root.style.setProperty("--app-font", f.css);
};

export const setAppFont = (id) => {
  try {
    if (id === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
  applyAppFont(id);
};

// Settings screen: preload every family so each name previews in its own typeface.
export const preloadAllFonts = () => APP_FONTS.forEach(loadFamily);
