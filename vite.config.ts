import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    target: 'es2022',
    rollupOptions: {
      // two pages: the simulator and the IFR Academy (interactive lessons, also reachable on its own)
      input: { main: resolve(__dirname, 'index.html'), academy: resolve(__dirname, 'academy.html') },
    },
  },
});
