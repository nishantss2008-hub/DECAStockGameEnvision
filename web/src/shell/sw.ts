/**
 * Service worker (MOBILE §9.5): app-shell precache only. Built by vite-plugin-pwa `injectManifest` (the generateSW
 * template cannot be bundled from a path containing an apostrophe, which this repo's folder has).
 * - Precache: the built JS/CSS/HTML and icons (self.__WB_MANIFEST).
 * - Navigations fall back to /index.html, except Firebase's reserved /__/ namespace.
 * - No runtime caching: Firestore, Auth token endpoints and the authority API always go to the network.
 * - `registerType: 'prompt'`: a waiting worker activates only when the page posts SKIP_WAITING ("Update ready · Reload").
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

interface WorkerScope {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'message', listener: (event: MessageEvent<{ type?: string } | null>) => void): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void scope.skipWaiting();
});

precacheAndRoute((self as unknown as WorkerScope).__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__\//] }));
