// Chat themes + fonts (Instagram-style "Customise": pick a Theme and a Font for ONE chat).
// Every theme is original artwork drawn here as small SVG patterns / gradients — no photos,
// no downloads. A theme sets the wallpaper, the colour of your bubbles and the received bubbles.

const svg = (w, h, body) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

const heartPath = "M0 -6 C-9 -16 -22 -4 0 14 C22 -4 9 -16 0 -6Z";
const hearts = (list, fill, op = 1) =>
  list.map(([x, y, s = 1, r = 0]) => `<path d='${heartPath}' transform='translate(${x} ${y}) rotate(${r}) scale(${s})' fill='${fill}' fill-opacity='${op}'/>`).join("");

const blob = (x, y, r, fill) => `<ellipse cx='${x}' cy='${y}' rx='${r}' ry='${r * 0.92}' fill='${fill}'/>`;
const face = (x, y, c = "#0b3a4a") =>
  `<g fill='none' stroke='${c}' stroke-opacity='.55' stroke-width='3' stroke-linecap='round'><path d='M${x - 14} ${y - 4}q4 -6 9 0'/><path d='M${x + 5} ${y - 4}q4 -6 9 0'/><path d='M${x - 8} ${y + 8}q8 8 16 0'/></g>`;

// text / bubble tones: [r g b]
const T = (id, name, o) => ({ id, name, dark: true, ...o });

export const CHAT_THEMES = [
  T("shapepals", "Shape pals", {
    out: [196, 231, 255], outText: [8, 44, 70], inn: [3, 36, 58],
    bg: { backgroundColor: "#00697a", backgroundImage: svg(320, 320, `${blob(70, 70, 60, "#0a6ad1")}${blob(220, 60, 52, "#0d8f86")}${blob(120, 200, 56, "#3f8f2a")}${blob(260, 230, 50, "#0b66cc")}${blob(30, 270, 40, "#0d8f86")}${face(70, 70)}${face(220, 60)}${face(120, 200)}${face(260, 230)}`), backgroundSize: "320px 320px" },
    thumb: "#00697a",
  }),
  T("touchgrass", "Touch grass", {
    out: [58, 86, 230], outText: [255, 255, 255], inn: [7, 40, 64],
    bg: { backgroundColor: "#05334f", backgroundImage: svg(180, 180, `<g stroke='#7bd37a' stroke-opacity='.55' stroke-width='2' stroke-linecap='round'><path d='M30 60l-3 -9M30 60l3 -10M30 60l0 -12'/><path d='M120 120l-3 -9M120 120l3 -10M120 120l0 -12'/><path d='M70 160l-3 -8M70 160l3 -9'/></g><g fill='#ff8aa5' fill-opacity='.7'><circle cx='90' cy='40' r='2'/><circle cx='150' cy='70' r='2'/><circle cx='20' cy='130' r='2'/><circle cx='150' cy='160' r='2'/></g><g fill='#b9a0ff' fill-opacity='.6'><circle cx='50' cy='100' r='3'/><circle cx='110' cy='20' r='2.5'/></g>`), backgroundSize: "180px 180px" },
    thumb: "#05334f",
  }),
  T("heartdrive", "Heart drive", {
    out: [214, 40, 80], outText: [255, 255, 255], inn: [26, 14, 64],
    bg: { backgroundColor: "#0a0a4a", backgroundImage: `${svg(300, 300, hearts([[70, 80, 2.2, -14], [210, 70, 1.6, 10], [150, 200, 2.6, 6], [250, 250, 1.4, -8], [50, 250, 1.5, 14]], "#ff2d55", 0.85))}, radial-gradient(80% 60% at 50% 30%, rgb(255 45 85 / .25), transparent 70%)`, backgroundSize: "300px 300px, auto" },
    thumb: "#1a0a5a",
  }),
  T("lofi", "Lo-Fi night", {
    out: [104, 66, 235], outText: [255, 255, 255], inn: [27, 18, 80],
    bg: { backgroundColor: "#1b0f66", backgroundImage: `${svg(360, 200, `<path d='M0 200V120h30V90h26v40h20V70h34v60h22V100h28v30h24V80h30v50h26V110h40V90h40V120h40v80z' fill='#2fd6e0' fill-opacity='.35'/><path d='M0 200V150h40v-24h30v34h24v-18h30v30h32v-40h36v52h40v-30h50v-24h40v-8h38v52z' fill='#3b27b8' fill-opacity='.9'/><circle cx='300' cy='40' r='16' fill='#fff' fill-opacity='.85'/><circle cx='310' cy='34' r='15' fill='#1b0f66'/>`)}, linear-gradient(#150a52, #2a1a96 55%, #3fb9d6)`, backgroundSize: "100% auto, auto", backgroundPosition: "bottom, center", backgroundRepeat: "no-repeat, no-repeat" },
    thumb: "#2a1a96",
  }),
  T("bubbletea", "Boba time", {
    out: [255, 214, 190], outText: [84, 40, 20], inn: [92, 52, 38],
    bg: { backgroundColor: "#8b5240", backgroundImage: svg(200, 200, `<g fill='#d99a6c' stroke='#5a3022' stroke-width='2'><rect x='38' y='34' width='34' height='44' rx='8'/><rect x='34' y='28' width='42' height='10' rx='5' fill='#f0c8a0'/></g><g fill='#5a3022'><circle cx='48' cy='68' r='3'/><circle cx='58' cy='70' r='3'/><circle cx='66' cy='66' r='3'/></g><g fill='#c47b73' fill-opacity='.7'><path d='M140 130l4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1z'/><path d='M40 150l3 7 8 1-6 5 2 8-7-5-7 5 2-8-6-5 8-1z'/></g><path d='M120 60q-9 -10 -16 -2q-4 8 16 22q20 -14 16 -22q-7 -8 -16 2z' fill='#7a4333'/>`), backgroundSize: "200px 200px" },
    thumb: "#8b5240",
  }),
  T("foliage", "Foliage", {
    out: [64, 196, 150], outText: [2, 40, 30], inn: [6, 44, 40],
    bg: { backgroundColor: "#03262a", backgroundImage: `${svg(260, 380, `<g fill='#0c6b58' fill-opacity='.75'><path d='M20 40q60 -30 100 30q-50 20 -100 -30z'/><path d='M150 120q70 -20 100 50q-60 10 -100 -50z'/><path d='M0 220q70 -40 120 20q-60 40 -120 -20z'/><path d='M140 300q60 -30 110 30q-60 30 -110 -30z'/></g><g stroke='#0e9477' stroke-opacity='.5' fill='none' stroke-width='2'><path d='M20 40q50 10 100 30'/><path d='M150 120q50 20 100 50'/><path d='M0 220q60 0 120 20'/></g>`)}, radial-gradient(90% 60% at 30% 20%, rgb(20 120 100 / .35), transparent 70%)`, backgroundSize: "260px 380px, auto" },
    thumb: "#03262a",
  }),
  T("googly", "Googly eyes", {
    out: [255, 255, 255], outText: [20, 40, 44], inn: [38, 70, 74],
    bg: { backgroundColor: "#2a4448", backgroundImage: svg(300, 300, `<g><circle cx='120' cy='140' r='30' fill='#f5f5f5'/><circle cx='190' cy='140' r='30' fill='#f5f5f5'/><circle cx='126' cy='148' r='15' fill='#111'/><circle cx='196' cy='148' r='15' fill='#111'/></g>`), backgroundSize: "300px 300px" },
    thumb: "#2a4448",
  }),
  T("love", "Love", {
    out: [255, 120, 200], outText: [70, 5, 50], inn: [70, 6, 74],
    bg: { backgroundColor: "#4f0a55", backgroundImage: `${svg(280, 280, hearts([[60, 60, 2.4, -10], [200, 100, 3, 12], [110, 210, 2, 4], [240, 240, 1.4, -14], [30, 160, 1.3, 8]], "#c43bd0", 0.35))}, linear-gradient(#7a0f72, #3a0646)`, backgroundSize: "280px 280px, auto" },
    thumb: "#5a0a60",
  }),
  T("luckypink", "Lucky charms", {
    out: [255, 160, 200], outText: [64, 6, 36], inn: [44, 14, 30],
    bg: { backgroundColor: "#2b0f1d", backgroundImage: svg(220, 220, `<g fill='none' stroke='#e68ab5' stroke-opacity='.55' stroke-width='3' stroke-linecap='round'><path d='M40 50a14 14 0 1 1 28 0v16h-8v-16a6 6 0 1 0 -12 0v16h-8z'/><path d='M150 40l8 16 18 3 -13 12 3 18 -16 -9 -16 9 3 -18 -13 -12 18 -3z'/><circle cx='60' cy='150' r='16'/><path d='M150 150q10 -18 20 0t-20 22q-30 -22 0 -22z'/></g><text x='96' y='112' font-size='34' font-family='Georgia,serif' fill='#e68ab5' fill-opacity='.5'>7</text>`), backgroundSize: "220px 220px" },
    thumb: "#2b0f1d",
  }),
  T("loops", "Black silk", {
    out: [235, 235, 240], outText: [20, 20, 24], inn: [34, 34, 38],
    bg: { backgroundColor: "#0a0a0c", backgroundImage: "radial-gradient(120% 40% at 70% 20%, rgb(255 255 255 / .22), transparent 60%), radial-gradient(120% 40% at 20% 55%, rgb(255 255 255 / .12), transparent 60%), radial-gradient(100% 35% at 80% 85%, rgb(255 255 255 / .14), transparent 60%)" },
    thumb: "#17171a",
  }),
  T("gothcharms", "Chains", {
    out: [200, 200, 210], outText: [18, 18, 22], inn: [40, 40, 46],
    bg: { backgroundColor: "#202024", backgroundImage: svg(200, 240, `<g fill='none' stroke='#6c6c76' stroke-opacity='.7' stroke-width='3'><ellipse cx='60' cy='40' rx='10' ry='16'/><ellipse cx='60' cy='72' rx='10' ry='16' transform='rotate(90 60 72)'/><ellipse cx='60' cy='104' rx='10' ry='16'/><ellipse cx='140' cy='150' rx='10' ry='16'/><ellipse cx='140' cy='182' rx='10' ry='16' transform='rotate(90 140 182)'/><ellipse cx='140' cy='214' rx='10' ry='16'/></g><path d='M100 120l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2z' fill='#7a7a86' fill-opacity='.5'/>`), backgroundSize: "200px 240px" },
    thumb: "#202024",
  }),
  T("coffee", "Coffee break", {
    out: [255, 200, 150], outText: [60, 25, 8], inn: [54, 22, 14],
    bg: { backgroundColor: "#200a06", backgroundImage: svg(240, 240, `<g fill='none' stroke='#8a4a32' stroke-opacity='.65' stroke-width='3' stroke-linecap='round'><path d='M60 90h70v34a30 30 0 0 1 -30 30h-10a30 30 0 0 1 -30 -30z'/><path d='M130 98h12a12 12 0 0 1 0 24h-12'/><path d='M80 70q-6 -10 0 -18M100 70q-6 -10 0 -18M118 70q-6 -10 0 -18'/><path d='M170 190h40M180 200h20'/><circle cx='36' cy='196' r='6'/></g>`), backgroundSize: "240px 240px" },
    thumb: "#200a06",
  }),
  T("sweetheart", "Sweetheart", {
    out: [255, 255, 255], outText: [140, 0, 60], inn: [150, 0, 55],
    bg: { backgroundColor: "#b8004a", backgroundImage: `${svg(300, 400, `<g><path d='M150 160c-40 -50 -110 0 -50 70q30 30 50 50q20 -20 50 -50c60 -70 -10 -120 -50 -70z' fill='#e0145f' fill-opacity='.9'/><path d='M262 100l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z M96 276l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z' fill='#fff' fill-opacity='.9'/></g>`)}`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" },
    thumb: "#b8004a",
  }),
  T("flirt", "Flirt", {
    out: [255, 140, 180], outText: [70, 8, 40], inn: [66, 24, 74],
    bg: { backgroundColor: "#3a1a3d", backgroundImage: svg(300, 300, hearts([[70, 80, 2.4, -10], [210, 140, 2.8, 12], [120, 240, 2.2, 4], [260, 40, 1.8, -12]], "#b8203d", 0.7) + hearts([[40, 190, 1.6, -8], [240, 260, 1.5, 10]], "#8b3dc2", 0.7)), backgroundSize: "300px 300px" },
    thumb: "#3a1a3d",
  }),
  T("thinking", "Thinking of you", {
    out: [255, 255, 255], outText: [20, 50, 160], inn: [18, 60, 190],
    bg: { backgroundColor: "#1e2fd0", backgroundImage: `${svg(300, 300, hearts([[80, 90, 3, -8], [220, 70, 2.2, 10], [150, 200, 3.4, 4], [250, 250, 2, -10]], "#2f8bff", 0.65))}, linear-gradient(#4528d8, #1070f0 60%, #2b1fb0)`, backgroundSize: "300px 300px, auto" },
    thumb: "#1e4fe0",
  }),
  T("graphpaper", "Graph paper", {
    out: [120, 230, 160], outText: [4, 40, 20], inn: [24, 24, 28],
    bg: { backgroundColor: "#050506", backgroundImage: "linear-gradient(rgb(255 255 255 / .06) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .06) 1px, transparent 1px)", backgroundSize: "26px 26px" },
    thumb: "#050506",
  }),
  T("notebook", "Notebook", {
    out: [255, 236, 150], outText: [60, 46, 0], inn: [46, 46, 50],
    bg: { backgroundColor: "#19191b", backgroundImage: "linear-gradient(rgb(255 255 255 / .07) 1px, transparent 1px), linear-gradient(90deg, transparent 38px, rgb(255 90 90 / .35) 38px, rgb(255 90 90 / .35) 40px, transparent 40px)", backgroundSize: "100% 28px, 100% 100%" },
    thumb: "#19191b",
  }),
  T("skygarden", "Sky garden", {
    out: [255, 190, 220], outText: [70, 10, 44], inn: [28, 30, 78],
    bg: { backgroundColor: "#161a44", backgroundImage: svg(300, 360, `<g><ellipse cx='90' cy='90' rx='60' ry='20' fill='#f4c8d8'/><ellipse cx='90' cy='74' rx='58' ry='14' fill='#3f7d3a'/><g fill='#ff8aa5'><circle cx='60' cy='66' r='3'/><circle cx='86' cy='62' r='3'/><circle cx='112' cy='68' r='3'/></g><ellipse cx='220' cy='230' rx='64' ry='22' fill='#f4c8d8'/><ellipse cx='220' cy='214' rx='62' ry='15' fill='#3f7d3a'/><g fill='#ffd36b'><circle cx='190' cy='206' r='3'/><circle cx='222' cy='202' r='3'/><circle cx='250' cy='208' r='3'/></g></g><g fill='#fff' fill-opacity='.7'><circle cx='30' cy='200' r='1.6'/><circle cx='270' cy='60' r='1.6'/><circle cx='150' cy='320' r='1.6'/><circle cx='40' cy='320' r='1.6'/></g>`), backgroundSize: "300px 360px" },
    thumb: "#161a44",
  }),
  T("court", "Court", {
    out: [255, 160, 70], outText: [60, 24, 0], inn: [38, 38, 42],
    bg: { backgroundColor: "#2a2a2e", backgroundImage: svg(320, 320, `<g fill='none' stroke='#fff' stroke-opacity='.22' stroke-width='3'><circle cx='160' cy='160' r='60'/><path d='M0 160h320M160 0v320'/><path d='M40 0v60a120 120 0 0 0 240 0v-60'/></g>`), backgroundSize: "320px 320px" },
    thumb: "#2a2a2e",
  }),
  T("pitch", "Pitch", {
    out: [190, 255, 150], outText: [20, 60, 0], inn: [24, 60, 36],
    bg: { backgroundColor: "#1f5a30", backgroundImage: "repeating-linear-gradient(0deg, rgb(255 255 255 / .05) 0 48px, transparent 48px 96px), linear-gradient(rgb(255 255 255 / .3) 2px, transparent 2px)", backgroundSize: "auto, 100% 192px" },
    thumb: "#1f5a30",
  }),
  T("paws", "Paw prints", {
    out: [255, 190, 130], outText: [64, 28, 0], inn: [48, 36, 34],
    bg: { backgroundColor: "#241c1c", backgroundImage: svg(200, 200, `<g fill='#8c7a72' fill-opacity='.4'><ellipse cx='60' cy='70' rx='14' ry='11'/><circle cx='42' cy='52' r='5'/><circle cx='54' cy='44' r='5'/><circle cx='68' cy='44' r='5'/><circle cx='80' cy='52' r='5'/><g transform='translate(100 80) rotate(20)'><ellipse cx='60' cy='70' rx='14' ry='11'/><circle cx='42' cy='52' r='5'/><circle cx='54' cy='44' r='5'/><circle cx='68' cy='44' r='5'/><circle cx='80' cy='52' r='5'/></g></g>`), backgroundSize: "200px 200px" },
    thumb: "#241c1c",
  }),
  T("sunset", "Sunset", {
    out: [255, 255, 255], outText: [150, 40, 0], inn: [160, 40, 20],
    bg: { backgroundColor: "#ff6a00", backgroundImage: "linear-gradient(#ff1f1f, #ff7a00 55%, #ffb400)" },
    thumb: "#ff6a00",
  }),
  T("midnight", "Midnight", {
    out: [52, 92, 220], outText: [255, 255, 255], inn: [22, 30, 60],
    bg: { backgroundColor: "#0a1030", backgroundImage: "radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1.5px 1.5px at 70% 20%, #fff, transparent), radial-gradient(1px 1px at 40% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 85% 60%, #fff, transparent), radial-gradient(1px 1px at 10% 85%, #fff, transparent), linear-gradient(#0a1030, #1a1f5c)", backgroundSize: "260px 260px, 260px 260px, 260px 260px, 260px 260px, 260px 260px, auto" },
    thumb: "#0a1030",
  }),
];

export const getTheme = (id) => CHAT_THEMES.find((t) => t.id === id) || null;

const rgb = (a) => a.join(" ");
const shade = (a, k) => a.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const hex = (a) => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");

// The colour of the header / status bar for a theme: a deeper shade of the received-bubble tone,
// so the top of the chat belongs to the wallpaper instead of staying a different navy.
export const themeBar = (theme) => (theme ? shade(theme.inn, 0.62) : null);
export const themeBarHex = (theme) => (theme ? hex(themeBar(theme)) : null);

// "Read" ticks must stand out on whatever colour the theme gives my bubbles: WhatsApp blue on a pink or red
// bubble disappears, so pick the blue (light or deep) with the best contrast against that bubble.
const lum = (a) => {
  const [r, g, b] = a.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
export function seenTickColor(out) {
  const blues = ["#53BDEB", "#8FE3FF", "#C9F2FF", "#0B7BD6", "#0A55A8", "#003E80"];
  let best = blues[0];
  let bestC = 0;
  for (const c of blues) {
    const k = contrast(hexToRgb(c), out);
    if (k >= 3.4) return c; // first one that reads clearly keeps the familiar look
    if (k > bestC) {
      bestC = k;
      best = c;
    }
  }
  return best;
}

// Inline style for a chat's container. Dark themes switch the chat to the dark palette (so
// text on the wallpaper stays readable), then the theme re-colours bubbles, header and bars.
// --ct-out-text is applied per own-bubble in CSS (.chat-themed .bg-wa-out) so the text on a
// light bubble is dark even though the rest of the chat uses light text.
export function themeStyle(theme, font) {
  const style = {};
  if (theme) {
    Object.assign(style, { backgroundSize: "auto", backgroundPosition: "0 0", backgroundRepeat: "repeat" }, theme.bg);
    const bar = themeBar(theme);
    style["--wa-out"] = rgb(theme.out);
    style["--wa-tint"] = rgb(theme.out);
    style["--wa-tinttext"] = rgb(theme.outText);
    style["--wa-surface"] = rgb(theme.inn);
    style["--wa-bg"] = rgb(bar);
    style["--wa-panel"] = rgb(bar);
    style["--wa-field"] = rgb(shade(theme.inn, 1.25));
    style["--wa-hover"] = rgb(shade(theme.inn, 1.15));
    style["--wa-pop"] = rgb(shade(theme.inn, 0.8));
    style["--ct-out-text"] = rgb(theme.outText);
    style["--ct-seen"] = seenTickColor(theme.out);
  }
  if (font?.css) style["--chat-font"] = font.css;
  return style;
}

// ---- Fonts (loaded from Google Fonts only once someone opens the picker / uses one) ----
export const CHAT_FONTS = [
  { id: "default", name: "Default", css: null },
  { id: "bubble", name: "Bubble", family: "Fredoka:wght@500;600;700", css: '"Fredoka", system-ui, sans-serif', weight: 600 },
  { id: "deco", name: "Deco", family: "Poiret+One", css: '"Poiret One", system-ui, sans-serif', weight: 400 },
  { id: "editor", name: "Editor", family: "Space+Mono:wght@400;700", css: '"Space Mono", ui-monospace, monospace', weight: 400 },
  { id: "poster", name: "Poster", family: "DM+Serif+Display", css: '"DM Serif Display", Georgia, serif', weight: 400 },
  { id: "serif", name: "Serif", family: "Lora:wght@400;500;600", css: '"Lora", Georgia, serif', weight: 400 },
  { id: "signature", name: "Signature", family: "Dancing+Script:wght@500;700", css: '"Dancing Script", "Brush Script MT", cursive', weight: 600 },
];

export const getFont = (id) => CHAT_FONTS.find((f) => f.id === id && f.css) || null;

export const loadChatFont = (f) => {
  if (!f?.family || typeof document === "undefined") return;
  const id = `gf-chat-${f.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.family}&display=swap`;
  document.head.appendChild(link);
};
