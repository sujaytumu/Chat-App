/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          green: "#075E54",
          teal: "#128C7E",
          light: "#25D366",
          bg: "#ECE5DD",
          chat: "#DCF8C6",
          dark: "#054640",
        },
      },
      fontFamily: {
        whatsapp: ["Segoe UI", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("daisyui")], // ✅ add DaisyUI plugin
  daisyui: {
    themes: [
      "light","dark","cupcake","bumblebee","emerald","corporate","synthwave","retro",
      "cyberpunk","valentine","halloween","garden","forest","aqua","lofi","pastel",
      "fantasy","wireframe","black","luxury","dracula","cmyk","autumn","business",
      "acid","lemonade","night","coffee","winter","dim","nord","sunset"
    ],
  },
};
