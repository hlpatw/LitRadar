import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Explicit, single-source-of-truth aliases (do NOT rely on tsconfig auto-resolution).
// Every client-internal import must use `@/...` so there is exactly one module identity.
const clientSrc = path.resolve(__dirname, 'client/src');
const sharedDir = path.resolve(__dirname, 'shared');

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'client'),
  resolve: {
    alias: {
      '@': clientSrc,
      '@shared': sharedDir,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
