import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Brotli copies of the big static files (about 15-20% smaller than gzip). The server sends the .br file to
// browsers that accept it and the normal file to everything else, so nothing changes for old clients.
const brotliAssets = () => ({
  name: 'brotli-assets',
  apply: 'build',
  closeBundle() {
    const dir = path.resolve('dist/assets')
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(js|css|svg|json)$/.test(f)) continue
      const file = path.join(dir, f)
      const src = fs.readFileSync(file)
      if (src.length < 1024) continue
      const br = zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } })
      if (br.length < src.length) fs.writeFileSync(file + '.br', br)
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), brotliAssets()],
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

