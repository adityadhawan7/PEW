import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: firebase/react hashes only change when the dependency
        // updates, so app deploys don't force phones to re-download the heavy vendor code.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
