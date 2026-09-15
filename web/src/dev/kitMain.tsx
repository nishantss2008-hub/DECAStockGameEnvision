/**
 * Entry for the dev-only component gallery (web/kit.html). Loads the same theme files as the app,
 * then the gallery inside a memory router (rows and tabs render links) and the toast provider.
 * `?screen=positions` renders one live screen instead (kitScreen.tsx: real document scroll, fixed bars).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import '../theme/tokens.css';
import '../theme/base.css';

import { ToastProvider } from '../components/ios/Toast';
import { KitGallery } from './KitGallery';
import { KitScreen } from './kitScreen';
import { installLightTokens } from './kitLightTokens';

installLightTokens();

const rootEl = document.getElementById('kit-root');
if (!rootEl) throw new Error('kit.html is missing #kit-root');

createRoot(rootEl).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/portfolio']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        {new URLSearchParams(window.location.search).get('screen') === 'positions' ? <KitScreen /> : <KitGallery />}
      </ToastProvider>
    </MemoryRouter>
  </StrictMode>,
);
