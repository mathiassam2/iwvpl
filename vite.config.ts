import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// The deploy base.
//
// Two targets exist and they are not the same:
//
//   GitHub Pages  https://mathiassam2.github.io/iwvpl/  ->  base '/iwvpl/'
//   Render        https://<app>.onrender.com/           ->  base '/'
//
// This used to be gated behind GITHUB_PAGES, so a build made locally (or in CI
// without that variable) shipped with base `/` and every asset 404'd on Pages.
// It is now an explicit BASE_PATH that defaults to the Pages value, so a local
// `npm run build` keeps reproducing the live site. The Docker build sets
// BASE_PATH=/ for Render.
//
// Note this is only half the problem. Vite rewrites `/…` references inside
// index.html but not string literals in JS/TS, which is why `asset()` in
// src/lib/assets.ts routes public files through import.meta.env.BASE_URL.
// Changing this value without that helper agreeing is how a build ends up with
// working HTML and 404ing images.
const base = process.env.BASE_PATH ?? '/iwvpl/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  preview: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})