import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate } from './AuthGate';
import './styles/tokens.css';
import './styles/scene.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
);
