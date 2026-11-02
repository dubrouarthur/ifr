import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 700, target: 'es2022' },
});
