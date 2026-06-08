import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './App.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('RegPulse could not start because #root was not found in index.html.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);