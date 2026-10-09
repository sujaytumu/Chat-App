/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "wa-bg": "rgb(var(--wa-bg) / <alpha-value>)",
        "wa-panel": "rgb(var(--wa-panel) / <alpha-value>)",
        "wa-surface": "rgb(var(--wa-surface) / <alpha-value>)",
        "wa-pop": "rgb(var(--wa-pop) / <alpha-value>)",
        "wa-field": "rgb(var(--wa-field) / <alpha-value>)",
        "wa-hover": "rgb(var(--wa-hover) / <alpha-value>)",
        "wa-text": "rgb(var(--wa-text) / <alpha-value>)",
        "wa-muted": "rgb(var(--wa-muted) / <alpha-value>)",
        "wa-icon": "rgb(var(--wa-icon) / <alpha-value>)",
        "wa-text2": "rgb(var(--wa-text2) / <alpha-value>)",
        "wa-muted2": "rgb(var(--wa-muted2) / <alpha-value>)",
        "wa-out": "rgb(var(--wa-out) / <alpha-value>)",
        "wa-tint": "rgb(var(--wa-tint) / <alpha-value>)",
        "wa-tinttext": "rgb(var(--wa-tinttext) / <alpha-value>)",
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
        sans: [
          '"Segoe UI"',
          "Helvetica Neue",
          "Helvetica",
          "Lucida Grande",
          "Arial",
          "Ubuntu",
          "Cantarell",
          '"Fira Sans"',
          "sans-serif",
        ],
        whatsapp: ["Segoe UI", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("daisyui")], // ✅ add DaisyUI plugin
  daisyui: {
    themes: [
      "dark", "night", "dracula", "forest", "business", "luxury",
      "black", "synthwave", "winter", "light", "emerald", "corporate"
    ],
  },
};
