import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The admin app is served by the API at https://<host>/admin, not from a
 * subfolder on a CDN, so the base is a real path rather than the GitHub Pages
 * `/iwvpl/` the public SPA uses.
 *
 * Dev runs on port 3001 to stay clear of the public SPA's 3000. The dev server
 * proxies /api to the API on 8080 so the app can be exercised locally without
 * CORS — in production both live on one origin and no proxy exists.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})