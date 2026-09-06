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
