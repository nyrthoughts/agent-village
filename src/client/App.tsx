import { useEffect, useState } from 'react';
import type { ObservedSession } from '../shared/observation.js';
import { useVillage } from './hooks/useVillage.js';
import { useActivity } from './hooks/useActivity.js';
import { savedLanguage, LANGUAGE_KEY, type Language } from './language.js';
import { translate } from './language.js';
import { VillageHeader } from './village/VillageHeader.js';
import { VillageScene } from './village/VillageScene.js';
import { NotificationPanel } from './village/NotificationPanel.js';
import { BoardView } from './village/BoardView.js';
import { SessionDrawer } from './village/SessionDrawer.js';

export function App() {
  const village = useVillage();
  const activity = useActivity();
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [view, setView] = useState<'village' | 'board'>('village');
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [, refreshClock] = useState(0);
  const now = Date.now();

  useEffect(() => {
    const timer = window.setInterval(() => refreshClock((c) => c + 1), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent('agent-village:language', { detail: language }));
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      /* optional */
    }
  }, [language]);

  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  if (!village.data && village.loading) {
    return (
      <main className="village-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>
          {language === 'fr' ? 'Chargement du village…' : 'Loading village…'}
        </p>
      </main>
    );
  }

  if (!village.data) {
    return (
      <main className="village-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>
          {village.error?.message ?? (language === 'fr' ? 'Impossible de charger le village.' : 'Could not load village.')}
        </p>
      </main>
    );
  }

  const workspace = village.data;
  const allSessions: ObservedSession[] = workspace.projects.flatMap(
    (p) => p.observation?.sessions ?? [],
  );
  const roots = allSessions.filter((s) => s.role !== 'helper');
  const selectedSession = selectedSessionId
    ? allSessions.find((s) => s.id === selectedSessionId)
    : undefined;

  const handleSelectSession = (session: ObservedSession, _trigger: HTMLButtonElement) => {
    setSelectedSessionId(session.id);
  };

  const handleSelectSessionById = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  return (
    <main className="village-shell" aria-label="Agent Village">
      <div className="village-shell__header">
        <VillageHeader
          language={language}
          onLanguageChange={setLanguage}
          sessionCount={roots.length}
          projectCount={workspace.projects.length}
        />
      </div>

      <div className="village-shell__scene">
        {view === 'village' ? (
          <VillageScene
            village={workspace}
            language={language}
            now={now}
            onSelectSession={handleSelectSession}
          />
        ) : (
          <BoardView
            village={workspace}
            language={language}
            now={now}
            onSelectSession={handleSelectSessionById}
          />
        )}
      </div>

      <div className="village-shell__panel">
        <NotificationPanel
          village={workspace}
          now={now}
          language={language}
          onSelectSession={handleSelectSessionById}
        />
      </div>

      <footer className="village-footer village-shell__footer">
        <div className="village-toggle" role="group" aria-label={language === 'fr' ? 'Vue' : 'View'}>
          <button
            type="button"
            className="village-toggle__btn"
            aria-pressed={view === 'village'}
            onClick={() => setView('village')}
          >
            <span className="village-toggle__icon">🏠</span>
            Village
          </button>
          <button
            type="button"
            className="village-toggle__btn"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            <span className="village-toggle__icon">📋</span>
            Board
          </button>
        </div>
      </footer>

      {selectedSession && (
        <SessionDrawer
          session={selectedSession}
          allSessions={allSessions}
          language={language}
          now={now}
          onClose={() => setSelectedSessionId(undefined)}
        />
      )}
    </main>
  );
}
