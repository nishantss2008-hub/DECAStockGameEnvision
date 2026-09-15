import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/**
 * Pages:
 * - `index.html` is the app. It is the only input of the production build (`vite build`).
 * - `kit.html` is the dev-only component gallery (src/dev). The dev server (`vite`) serves it at
 *   /kit.html; it is never in the production build. `vite build --mode kit` builds only the gallery
 *   (into dist-kit/) so it can be checked or screenshotted without the app.
 */
export default defineConfig(({ mode }) => {
  const kit = mode === 'kit';
  const input: Record<string, string> = kit ? { kit: page('./kit.html') } : { main: page('./index.html') };
  return {
    plugins: [react()],
    server: { port: 5173 },
    preview: { port: 5173 },
    build: {
      outDir: kit ? 'dist-kit' : 'dist',
      rollupOptions: {
        input,
      },
    },
  };
});
