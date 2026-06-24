import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Stamp the bundle with the moment it was (re)started/built. Surfaces stale-cache
// bugs: if the UI shows an old build id after a change, you're on a cached bundle.
const BUILD_ID = new Date().toISOString().slice(5, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
