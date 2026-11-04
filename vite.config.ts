import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    target: 'es2022',
    rollupOptions: {
      // three pages: the simulator, the IFR Academy (interactive lessons, also reachable on its own) and the
      // instructor console a phone or tablet opens by scanning the simulator's pairing QR code
      input: { main: resolve(import.meta.dirname, 'index.html'), academy: resolve(import.meta.dirname, 'academy.html'), remote: resolve(import.meta.dirname, 'remote.html') },
    },
  },
});
