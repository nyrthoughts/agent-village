import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import { BoardApp } from './board/BoardApp';
import { VillageApp } from './village/VillageApp';
import './styles/tokens.css';

function Root() {
  const [mode, setMode] = useState<'village' | 'board'>(() => {
    try { return localStorage.getItem('agent-village:view') === 'board' ? 'board' : 'village'; }
    catch { return 'village'; }
  });
  const toggle = () => {
    const next = mode === 'village' ? 'board' : 'village';
    setMode(next);
    try { localStorage.setItem('agent-village:view', next); } catch { /* ok */ }
  };
  return <AuthGate>
    {mode === 'village' ? <VillageApp fetchImpl={fetch} /> : <BoardApp fetchImpl={fetch} />}
    <button type="button" className="view-toggle" onClick={toggle}
      aria-label={mode === 'village' ? 'Switch to board view' : 'Switch to village view'}>
      {mode === 'village' ? 'Board' : 'Village'}
    </button>
  </AuthGate>;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(<StrictMode><Root /></StrictMode>);
