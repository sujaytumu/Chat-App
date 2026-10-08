import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

