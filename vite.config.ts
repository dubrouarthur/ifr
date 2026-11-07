import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { BRAND } from './src/brand.ts';

// the product name lives in src/brand.ts: the pages carry %BRAND_NAME% / %BRAND_TAGLINE_EN% placeholders
const brandHtml = {
  name: 'brand-html',
  transformIndexHtml: {
    order: 'pre' as const,
    handler: (html: string) =>
      html.split('%BRAND_NAME%').join(BRAND.name).split('%BRAND_TAGLINE_EN%').join(BRAND.tagline.en),
  },
};

export default defineConfig({
  plugins: [brandHtml],
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
