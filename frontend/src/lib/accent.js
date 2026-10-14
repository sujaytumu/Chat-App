// App-wide accent colour (Settings → Appearance → Accent colour). Re-tints every
// green button, badge, link and highlight; "Talkies green" is the default.
export const ACCENTS = [
  { id: "green", name: "Talkies green", a: "#3BE07D", b: "#00A884" },
  { id: "ocean", name: "Ocean", a: "#38BDF8", b: "#0284C7" },
  { id: "violet", name: "Violet", a: "#A78BFA", b: "#7C3AED" },
  { id: "rose", name: "Rose", a: "#FB7185", b: "#E11D48" },
  { id: "sunset", name: "Sunset", a: "#FDBA74", b: "#EA580C" },
  { id: "teal", name: "Teal", a: "#2DD4BF", b: "#0D9488" },
  { id: "gold", name: "Gold", a: "#FDE047", b: "#CA8A04" },
];
const KEY = "talkies-accent";

export const getAccent = () => {
  try {
    const v = localStorage.getItem(KEY);
    return ACCENTS.some((x) => x.id === v) ? v : "green";
  } catch {
    return "green";
  }
};

export const applyAccent = (id = getAccent()) => {
  const root = document.documentElement;
  const c = ACCENTS.find((x) => x.id === id) || ACCENTS[0];
  if (c.id === "green") {
    root.removeAttribute("data-accent");
    root.style.removeProperty("--ac1");
    root.style.removeProperty("--ac2");
    return;
  }
  root.setAttribute("data-accent", c.id);
  root.style.setProperty("--ac1", c.a);
  root.style.setProperty("--ac2", c.b);
};

export const setAccent = (id) => {
  try {
    if (id === "green") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
  applyAccent(id);
};
