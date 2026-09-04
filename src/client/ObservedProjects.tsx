import { useEffect, useRef, useState } from 'react';
import type { DerivedWorkspace } from '../server/truth/derive.js';
import type { ActivitySnapshot } from '../shared/activity.js';
import { VillageMap2D } from './scene2d/VillageMap2D.js';
import { projectBrief, type SourcedUpdate } from '../shared/projectBrief.js';
import './observed-projects.css';

const states = { working: 'En cours', waiting: 'En attente', idle: 'Sans activité récente', unknown: 'État non confirmé' };
const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
function savedRead(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('agent-village:read') ?? '{}');
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, at]) => typeof at === 'string' && Number.isFinite(Date.parse(at)))) : {};
  } catch { return {}; }
}

export function ObservedProjects({ village, activity, error }: { village: DerivedWorkspace; activity?: ActivitySnapshot; error?: string }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'brief' | 'timeline' | 'sessions'>('brief');
  const [sessionId, setSessionId] = useState<string>();
  const [read, setRead] = useState(savedRead);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement>();
  const selected = village.projects.find((project) => project.id === selectedId);
  const sessions = village.projects.flatMap((project) => project.observation?.sessions ?? []);
  const focusNames = village.observation?.focusProjects ?? [];
  const focused = focusNames.length ? village.projects.filter((project) => focusNames.includes(project.name)) : village.projects;
  const candidates = showAll || filter ? village.projects : focused;
  const visible = candidates.filter((project) => project.name.toLowerCase().includes(filter.toLowerCase()));
  const brief = selected && projectBrief(selected.observation?.sessions ?? [], read[selected.id]);
  const mapProjects = visible.slice(0, 9).sort((a, b) => a.id.localeCompare(b.id));
  const mapActivity = activity && { ...activity, workers: activity.workers.filter((worker) => worker.state !== 'idle' && mapProjects.some((project) => project.id === worker.attachedTaskId)) };
  const select = (id: string, element: HTMLElement) => { trigger.current = element; setSelectedId(id); setTab('brief'); setSessionId(undefined); };
  const markRead = () => {
    if (!selected || !brief?.timeline[0]) return;
    const next = { ...read, [selected.id]: brief.timeline[0].at };
    setRead(next);
    try { localStorage.setItem('agent-village:read', JSON.stringify(next)); } catch { /* Memory-only reading point if storage is disabled. */ }
  };
  const source = (entry: SourcedUpdate) => <button type="button" className="observed-source" onClick={() => { setSessionId(entry.sessionId); setTab('sessions'); }}>{entry.tool} · {entry.sessionTitle.slice(0, 55)} · {date(entry.at)}</button>;
  useEffect(() => {
    if (!selectedId) return;
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(undefined);
      if (event.key === 'Tab') {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button, input, a[href], summary') ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); trigger.current?.focus(); };
  }, [selectedId]);

  return <main className="app-shell observed-shell" aria-label="Agent Village privé">
    <header className="observed-header">
      <div><small>AGENT VILLAGE / LOCAL PRIVÉ</small><h1>Mes projets, maintenant</h1><p>{village.projects.length} projets · {sessions.length} sessions</p></div>
      <div><strong>{sessions.filter((session) => session.state === 'working').length} agents en cours</strong><p>Lu à {date(village.observation!.fetchedAt)} · actualisation 5 s</p></div>
    </header>
    {(error || village.observation?.errors.length !== 0) && <p role="alert" className="observed-warning">{error ?? village.observation?.errors.join(' · ')}. Les données déjà lues restent affichées.</p>}
    <div className="observed-layout">
      <nav className="observed-projects" aria-label="Projets connectés">
        {focusNames.length > 0 && <button type="button" className="observed-scope" onClick={() => setShowAll(!showAll)}>{showAll ? `Revenir aux ${focused.length} projets suivis` : `Voir aussi les ${village.projects.length - focused.length} autres projets`}</button>}
        <label>Rechercher un projet<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Projet…" /></label>
        {visible.map((project) => {
          const entries = project.observation?.sessions ?? [];
          const working = entries.filter((entry) => entry.state === 'working').length;
          const summary = projectBrief(entries, read[project.id]);
          return <button type="button" key={project.id} aria-label={`Ouvrir ${project.name}`} onClick={(event) => select(project.id, event.currentTarget)}>
            <strong>{project.name}</strong><small>{entries.length} sessions · {working ? `${working} en cours` : 'Derniers échanges'}</small>
            {summary.unread > 0 && <b className="observed-new">{summary.unread} nouveaux échanges</b>}
            <span>{summary.latest?.text.slice(0, 220) ?? entries[0]?.objective?.slice(0, 160) ?? 'Ouvrir les sessions'}</span>
            <time>{date(summary.latest?.at ?? project.observation!.lastActivityAt)}</time>
          </button>;
        })}
      </nav>
      <section className="game-stage observed-map" aria-label="Bâtiments de mes projets">
        <VillageMap2D village={{ ...village, projects: mapProjects }} activity={mapActivity} onSelect={(_task, element, project) => select(project.id, element)} onSelectWorker={(worker, element) => { if (worker.attachedTaskId) select(worker.attachedTaskId, element); }} />
        <p className="observed-map-note">{mapProjects.length} projets récents sur la carte · recherche pour les autres. Chantier = activité, pas livraison.</p>
      </section>
    </div>
    <footer className="observed-footer">{village.observation?.historyWindow}. Les résumés sont les déclarations des agents, non des résultats vérifiés. Rien n’est envoyé à GitHub.</footer>
    {selected && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(undefined); }}>
      <aside ref={dialog} className="detail-drawer observed-drawer" role="dialog" aria-modal="true" aria-labelledby="observed-project-title">
        <header className="detail-drawer__header"><div><span>Projet connecté</span><h2 id="observed-project-title">{selected.name}</h2></div><button ref={close} className="drawer-close" type="button" aria-label="Fermer le projet" onClick={() => setSelectedId(undefined)}>×</button></header>
        <div className="detail-drawer__body">
          <nav className="observed-tabs" aria-label="Vue du projet"><button type="button" aria-pressed={tab === 'brief'} onClick={() => setTab('brief')}>Bilan</button><button type="button" aria-pressed={tab === 'timeline'} onClick={() => setTab('timeline')}>Évolution</button><button type="button" aria-pressed={tab === 'sessions'} onClick={() => { setTab('sessions'); setSessionId(undefined); }}>Conversations</button><button type="button" onClick={markRead}>Marquer comme lu</button></nav>
          <p>{brief?.working} en cours · {brief?.waiting} en attente · {brief?.unread ?? 0} nouveaux échanges depuis le dernier point de lecture.</p>
          {tab === 'brief' && brief && <section className="observed-brief">
            <h3>Bilan du projet</h3>
            <p className="observed-explanation">Extraits des derniers comptes rendus par conversation, datés et consultables. Pas de pourcentage déduit de l’activité.</p>
            {brief.current.length === 0 && <p>Aucun compte rendu textuel dans la fenêtre lue. Les sessions et leur état restent accessibles.</p>}
            {brief.current.map((entry) => <article key={entry.sessionId}><h4>{entry.sessionTitle}</h4>{source(entry)}<p>{entry.text.slice(0, 700)}{entry.text.length > 700 ? '…' : ''}</p></article>)}
            {(['done', 'next', 'blocked'] as const).map((section) => brief.reported[section].length > 0 && <section key={section}><h3>{{ done: 'Fait — déclaré par les agents', next: 'Suite explicitement annoncée', blocked: 'Blocages explicitement signalés' }[section]}</h3><ul>{brief.reported[section].map((entry, index) => <li key={index}><p>{entry.text}</p>{source(entry)}</li>)}</ul></section>)}
          </section>}
          {tab === 'timeline' && <section className="observed-evolution"><h3>Ce qui a changé</h3><p>Chronologie réunie de toutes les conversations du projet. Les changements d’état seuls ne sont pas comptés comme du travail livré.</p><ol>{brief?.timeline.map((entry, index) => <li key={`${entry.sessionId}:${entry.at}:${index}`}><strong>{entry.kind === 'report' ? 'Compte rendu' : 'Demande'}</strong>{source(entry)}<p>{entry.text}</p></li>)}</ol></section>}
          {tab === 'sessions' && selected.observation?.sessions.filter((session) => !sessionId || session.id === sessionId).map((session) => <article className="observed-session" key={session.id}>
            <header><small>{session.tool.toUpperCase()} · {states[session.state]}</small><h3>{session.title}</h3><time>{date(session.lastActivityAt)}</time></header>
            {session.terminal && <p>Terminal tmux : <code>{session.terminal}</code></p>}
            {session.objective && <section><h4>Dernière demande</h4><p>{session.objective}</p></section>}
            {session.summary && <section><h4>Dernier compte rendu de l’agent</h4><p>{session.summary}</p></section>}
            <section><h4>Historique récent</h4><ol>{session.history.slice().reverse().map((update, index) => <li key={`${update.at}:${index}`}><small>{date(update.at)} · {update.kind === 'report' ? 'Agent' : 'Demande'}</small><p>{update.text}</p></li>)}</ol></section>
            <small>{session.sourceNote} · {session.id}</small>
          </article>)}
        </div>
      </aside>
    </div>}
  </main>;
}
