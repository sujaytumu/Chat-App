import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // A different stamp on every build: the main file's name always changes, so every deploy
  // (even one that only touches lazy-loaded pages) shows the "Update" button on every device.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  base: "./",       // ✅ required for GitHub Pages
  build: {
    outDir: "dist", // ✅ explicit output folder
    rollupOptions: {
      output: {
        // Libraries change rarely: keeping them in their own hashed files means
        // a normal app update only re-downloads the small app chunk.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          realtime: ["socket.io-client", "axios"],
        },
      },
    },
  },
})

