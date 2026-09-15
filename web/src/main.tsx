/**
 * App entry point: theme (tokens first, then base styles), then <App/> (auth + data router).
 * Solid bars is applied before first paint by the inline script in index.html.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

import './theme/tokens.css';
import './theme/base.css';

import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
