import { useEffect, useMemo, useState } from 'react';
import type { Worker } from '../shared/activity.js';
import type { ObservedSession } from '../shared/observation.js';
import type { DerivedWorkspace, DerivedProject } from '../server/truth/derive.js';
import { useVillage } from './hooks/useVillage.js';
import { useActivity } from './hooks/useActivity.js';
import { savedLanguage, LANGUAGE_KEY, type Language } from './language.js';
import { translate } from './language.js';
import { VillageHeader } from './village/VillageHeader.js';
import { VillageScene } from './village/VillageScene.js';
import { NotificationPanel } from './village/NotificationPanel.js';
import { BoardView } from './village/BoardView.js';
import { SessionDrawer } from './village/SessionDrawer.js';

function workerToSession(worker: Worker, projectKey: string): ObservedSession {
  return {
    ...worker,
    projectKey,
    history: [],
  };
}

function allTaskIds(project: DerivedProject): Set<string> {
  const ids = new Set<string>();
  for (const task of project.tasks) {
    ids.add(task.id);
    for (const sub of task.subtasks) ids.add(sub.id);
  }
  for (const feature of project.features) {
    for (const task of feature.tasks) {
      ids.add(task.id);
      for (const sub of task.subtasks) ids.add(sub.id);
    }
  }
  return ids;
}

function enrichWorkspace(
  workspace: DerivedWorkspace,
  workers: Worker[],
): DerivedWorkspace {
  const hasObservation = workspace.projects.some(
    (p) => p.observation && p.observation.sessions.length > 0,
  );
  if (hasObservation || workers.length === 0) return workspace;

  const projects = workspace.projects.map((project): DerivedProject => {
    const taskIds = allTaskIds(project);
    const projectWorkers = workers.filter(
      (w) => w.attachedTaskId && taskIds.has(w.attachedTaskId),
    );
    if (projectWorkers.length === 0) return project;

    const sessions: ObservedSession[] = projectWorkers.map((w) =>
      workerToSession(w, project.id),
    );
    const lastActivityAt =
      sessions
        .map((s) => s.lastActivityAt)
        .sort()
        .pop() ?? new Date().toISOString();

    return {
      ...project,
      observation: {
        sessions,
        lastActivityAt,
      },
    };
  });

  return { ...workspace, projects };
}

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
          {language === 'fr' ? 'Chargement du village\u2026' : 'Loading village\u2026'}
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

  const workspace = enrichWorkspace(
    village.data,
    activity.data?.workers ?? [],
  );

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
            <span className="village-toggle__icon" aria-hidden="true">&#x1F3E0;</span>
            Village
          </button>
          <button
            type="button"
            className="village-toggle__btn"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            <span className="village-toggle__icon" aria-hidden="true">&#x1F4CB;</span>
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
