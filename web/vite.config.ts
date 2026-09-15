import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/**
 * Pages:
 * - `index.html` is the app. It is the only input of the production build (`vite build`).
 * - `kit.html` is the dev-only component gallery (src/dev). The dev server (`vite`) serves it at
 *   /kit.html; it is never in the production build. `vite build --mode kit` builds only the gallery
 *   (into dist-kit/) so it can be checked or screenshotted without the app.
 *
 * PWA (MOBILE §9.3, §9.5): an app-shell precache only (src/shell/sw.ts via injectManifest; the generateSW
 * template breaks on this repo's path, which contains an apostrophe). `registerType: 'prompt'` never reloads
 * mid-trade (shell/UpdatePrompt shows "Update ready · Reload"). The worker has no runtime caching at all, so Firestore,
 * Auth token endpoints and the authority API always go to the network; navigations fall back to index.html except
 * Firebase's reserved /__/ namespace. Icons come from `npx pwa-assets-generator` (pwa-assets.config.ts).
 */
export default defineConfig(({ mode }) => {
  const kit = mode === 'kit';
  const input: Record<string, string> = kit ? { kit: page('./kit.html') } : { main: page('./index.html') };
  return {
    plugins: [
      react(),
      !kit &&
        VitePWA({
          registerType: 'prompt',
          injectRegister: false,
          manifest: {
            id: '/',
            name: 'Buccaneer Exchange',
            short_name: 'Buccaneer',
            start_url: '/portfolio?source=homescreen',
            scope: '/',
            display: 'standalone',
            theme_color: '#111412',
            background_color: '#0B0D0C',
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          strategies: 'injectManifest',
          srcDir: 'src/shell',
          filename: 'sw.ts',
          injectManifest: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          },
          devOptions: { enabled: false },
        }),
    ],
    server: { port: 5173 },
    preview: { port: 5173 },
    build: {
      outDir: kit ? 'dist-kit' : 'dist',
      rollupOptions: {
        input,
        // @deca/shared re-exports its zod schemas (server-side validation). The app never uses them, but zod's
        // top-level calls look like side effects, which kept ~14 KB gzip of zod in the first view (MOBILE §9.7).
        treeshake: { moduleSideEffects: (id: string) => !/[\\/]shared[\\/]dist[\\/]schemas\.js$/.test(id) },
      },
    },
  };
});
