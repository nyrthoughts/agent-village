import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VILLAGE_PUBLIC_BASE || '/',
  plugins: [react()],
  build: {
    // Keep the complete pixel village in one small browser bundle.
    chunkSizeWarningLimit: 720,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4180',
    },
  },
});
