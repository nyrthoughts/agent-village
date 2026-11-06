import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import { BoardApp } from './board/BoardApp';
import './styles/tokens.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <AuthGate><BoardApp /></AuthGate>
  </StrictMode>,
);
