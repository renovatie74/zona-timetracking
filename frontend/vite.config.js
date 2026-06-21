import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    // Proxy /api/* to local wrangler dev (default port 8787) during development.
    // In production, Pages _redirects proxies to the deployed Worker.
    proxy: {
      '/api': {
        target:       'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
