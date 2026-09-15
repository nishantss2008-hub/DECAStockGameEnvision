/**
 * PWA icons (MOBILE §9.3) from the original compass-rose SVG: `npx pwa-assets-generator` writes
 * public/icons/icon-192.png, icon-512.png, icon-maskable-512.png (80% safe zone) and apple-touch-icon-180.png.
 * All icons are opaque hull (#111412); no transparency.
 */
import { defineConfig, type Preset } from '@vite-pwa/assets-generator/config';

const hull = { r: 17, g: 20, b: 18, alpha: 1 };

const preset: Preset = {
  transparent: { sizes: [192, 512], favicons: [], padding: 0, resizeOptions: { background: hull } },
  maskable: { sizes: [512], padding: 0.2, resizeOptions: { background: hull } },
  apple: { sizes: [180], padding: 0, resizeOptions: { background: hull } },
  png: { compressionLevel: 9, quality: 90 },
  assetName: (type, size) => {
    if (type === 'maskable') return `icon-maskable-${size.width}.png`;
    if (type === 'apple') return `apple-touch-icon-${size.width}.png`;
    return `icon-${size.width}.png`;
  },
};

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset,
  images: ['public/icons/compass-rose.svg'],
});
