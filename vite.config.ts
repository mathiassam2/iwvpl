import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages serves from https://mathiassam2.github.io/iwvpl/
//
// This used to be gated behind GITHUB_PAGES, so a build made locally (or in CI
// without that variable) shipped with base `/` and every asset 404'd on Pages.
// It is now unconditional: Vite's dev server serves the same base, so local
// development happens at http://localhost:3000/iwvpl/.
const base = '/iwvpl/'

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