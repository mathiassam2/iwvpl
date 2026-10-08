import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Test harness config: bundles the app as a single classic (non-ESM) IIFE with
 * CSS emitted separately, so the built artefact can be executed inside jsdom.
 * The browser automation tool returns 502 for every module request in this
 * environment, so all UI verification runs through this bundle instead.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  cssCodeSplit: false,
  build: {
    outDir: '_crawl/verify-dist',
    emptyOutDir: true,
    cssMinify: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      formats: ['iife'],
      name: 'IWVPLTest',
      fileName: () => 'app.js',
    },
    rollupOptions: { output: { assetFileNames: 'app.[ext]' } },
  },
})
