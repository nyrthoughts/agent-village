import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js is the product's renderer; the shipped bundle remains ~186 kB gzip.
    chunkSizeWarningLimit: 720,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4180',
    },
  },
});
