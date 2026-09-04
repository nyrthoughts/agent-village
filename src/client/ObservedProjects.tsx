import { useEffect, useRef, useState } from 'react';
import type { DerivedWorkspace } from '../server/truth/derive.js';
import type { ActivitySnapshot } from '../shared/activity.js';
import { VillageMap2D } from './scene2d/VillageMap2D.js';
import './observed-projects.css';

const states = { working: 'En cours', waiting: 'En attente', idle: 'Sans activité récente', unknown: 'État non confirmé' };
const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function ObservedProjects({ village, activity, error }: { village: DerivedWorkspace; activity?: ActivitySnapshot; error?: string }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState('');
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement>();
  const selected = village.projects.find((project) => project.id === selectedId);
  const sessions = village.projects.flatMap((project) => project.observation?.sessions ?? []);
  const visible = village.projects.filter((project) => project.name.toLowerCase().includes(filter.toLowerCase()));
  const mapProjects = visible.slice(0, 9).sort((a, b) => a.id.localeCompare(b.id));
  const mapActivity = activity && { ...activity, workers: activity.workers.filter((worker) => worker.state !== 'idle' && mapProjects.some((project) => project.id === worker.attachedTaskId)) };
  const select = (id: string, element: HTMLElement) => { trigger.current = element; setSelectedId(id); };
  useEffect(() => {
    if (!selectedId) return;
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(undefined);
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); }
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
        <label>Rechercher un projet<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Projet…" /></label>
        {visible.map((project) => {
          const entries = project.observation?.sessions ?? [];
          const working = entries.filter((entry) => entry.state === 'working').length;
          return <button type="button" key={project.id} aria-label={`Ouvrir ${project.name}`} onClick={(event) => select(project.id, event.currentTarget)}>
            <strong>{project.name}</strong><small>{entries.length} sessions · {working ? `${working} en cours` : 'Derniers échanges'}</small>
            <span>{entries[0]?.summary?.slice(0, 160) ?? entries[0]?.objective?.slice(0, 160) ?? 'Ouvrir les sessions'}</span>
            <time>{date(project.observation!.lastActivityAt)}</time>
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
      <aside className="detail-drawer observed-drawer" role="dialog" aria-modal="true" aria-labelledby="observed-project-title">
        <header className="detail-drawer__header"><div><span>Projet connecté</span><h2 id="observed-project-title">{selected.name}</h2></div><button ref={close} className="drawer-close" type="button" aria-label="Fermer le projet" onClick={() => setSelectedId(undefined)}>×</button></header>
        <div className="detail-drawer__body">
          <p>Derniers rapports et demandes, conservés dans les journaux locaux. Une réponse « terminé » ne prouve pas un déploiement.</p>
          {selected.observation?.sessions.map((session) => <article className="observed-session" key={session.id}>
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
