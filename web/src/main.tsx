/**
 * App entry point. Imports the theme, then mounts <App/> inside the router and
 * auth provider so every route has access to navigation and the signed-in user.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './theme/tokens.css';
import './theme/pirate.css';

import App from './App';
import { AuthProvider } from './lib/auth';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
