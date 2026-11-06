import { useEffect, useState } from 'react';
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
import { DEMO_WORKERS, type DemoWorker } from './village/demoFixture.js';

function workerToSession(worker: Worker, projectKey: string): ObservedSession {
  const demo = worker as Partial<DemoWorker>;
  const history = demo.demoSummary
    ? [{ at: worker.lastActivityAt, kind: 'report' as const, text: demo.demoSummary }]
    : [];
  return { ...worker, projectKey, history };
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

function enrichWorkspace(workspace: DerivedWorkspace, workers: Worker[], activityStatus?: string): { enriched: DerivedWorkspace; isDemoMode: boolean } {
  const hasObservation = workspace.projects.some((p) => p.observation && p.observation.sessions.length > 0);
  if (hasObservation) return { enriched: workspace, isDemoMode: false };

  const isDemoMode = activityStatus === 'demo' || workers.length === 0;
  const allWorkers = isDemoMode ? DEMO_WORKERS : workers;

  const projects = workspace.projects.map((project): DerivedProject => {
    const taskIds = allTaskIds(project);
    const demoWorkers = allWorkers.filter((w) => {
      const demo = w as Partial<DemoWorker>;
      if (demo.demoProject) return demo.demoProject === project.id;
      return w.attachedTaskId ? taskIds.has(w.attachedTaskId) : false;
    });
    if (demoWorkers.length === 0) return project;

    const sessions: ObservedSession[] = demoWorkers.map((w) => workerToSession(w, project.id));
    const lastActivityAt = sessions.map((s) => s.lastActivityAt).sort().pop() ?? new Date().toISOString();
    return { ...project, observation: { sessions, lastActivityAt } };
  });

  return { enriched: { ...workspace, projects }, isDemoMode };
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
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* optional */ }
  }, [language]);

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
          {village.error?.message ?? (language === 'fr' ? 'Village indisponible.' : 'Village unavailable.')}
        </p>
      </main>
    );
  }

  const { enriched: workspace, isDemoMode } = enrichWorkspace(village.data, activity.data?.workers ?? [], activity.data?.status);

  const allSessions: ObservedSession[] = workspace.projects.flatMap((p) => p.observation?.sessions ?? []);
  const roots = allSessions.filter((s) => s.role !== 'helper');
  const selectedSession = selectedSessionId ? allSessions.find((s) => s.id === selectedSessionId) : undefined;

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
            onSelectSession={(session, trigger) => setSelectedSessionId(session.id)}
          />
        ) : (
          <BoardView
            village={workspace}
            language={language}
            now={now}
            onSelectSession={(id) => setSelectedSessionId(id)}
          />
        )}
      </div>

      <div className="village-shell__panel">
        <NotificationPanel
          village={workspace}
          now={now}
          language={language}
          onSelectSession={(id) => setSelectedSessionId(id)}
          isDemoMode={isDemoMode}
        />
      </div>

      <footer className="village-footer village-shell__footer">
        <div className="village-toggle" role="group" aria-label={language === 'fr' ? 'Vue' : 'View'}>
          <button type="button" className="village-toggle__btn" aria-pressed={view === 'village'} onClick={() => setView('village')}>
            <span className="village-toggle__icon" aria-hidden="true">&#x1F3E0;</span> Village
          </button>
          <button type="button" className="village-toggle__btn" aria-pressed={view === 'board'} onClick={() => setView('board')}>
            <span className="village-toggle__icon" aria-hidden="true">&#x1F4CB;</span> Board
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
