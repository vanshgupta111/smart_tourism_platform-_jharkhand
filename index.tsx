// index.tsx
import React from 'react';
// Use named import for createRoot, which is standard in modern React
import { createRoot } from 'react-dom/client'; 
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Correct usage of the named import
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);