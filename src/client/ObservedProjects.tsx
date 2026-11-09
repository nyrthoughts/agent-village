import { useEffect, useRef, useState } from 'react';
import type { DerivedWorkspace } from '../server/truth/derive.js';
import type { ActivitySnapshot } from '../shared/activity.js';
import { VillageMap2D } from './scene2d/VillageMap2D.js';
import { projectBrief, villageBriefing, type SourcedUpdate } from '../shared/projectBrief.js';
import { LANGUAGE_KEY, savedLanguage, translate, translateDiagnostic, type Language } from './language.js';
import './observed-projects.css';
import { ProjectPlanPanel } from './ProjectPlanPanel.js';
import { milestoneTaskId, projectDistrict } from './observedDistrict.js';
import { hasRecentActivity, isConfirmedWorking, presentWorkerState } from '../shared/workerPresentation.js';
import type { MatchedBy, MatchVia, ObservedSession, OwnerLink } from '../shared/observation.js';

const states = { working: 'En cours', waiting: 'En attente', idle: 'Sans activité récente', unknown: 'État non confirmé' } as const;
const matchLabels = { rule: 'Rangé par votre règle', remote: 'Même dépôt distant', 'git-root': 'Même dépôt Git', folder: 'Même dossier', unassigned: 'Non classée' } as const satisfies Record<MatchedBy, string>;
const viaLabels = { session: 'identifiant de session', path: 'chemin', remote: 'dépôt distant', title: 'titre', recorded: 'enregistré par Codex',
  'claude-worktree': 'worktree Claude', 'catch-all': 'dossier fourre-tout', 'no-cwd': 'aucun dossier enregistré', 'unknown-hash': 'dossier Gemini non retrouvé' } as const satisfies Record<MatchVia, string>;
// Product names are not translated.
const sourceGroups = [['claude', 'Claude Code CLI'], ['codex', 'Codex'], ['openclaw', 'OpenClaw'], ['other', '']] as const;
const linkSources = { 'claude-app': 'Claude app', chatgpt: 'ChatGPT', other: '' } as const satisfies Record<OwnerLink['source'], string>;
function savedRead(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('agent-village:read') ?? '{}');
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, at]) => typeof at === 'string' && Number.isFinite(Date.parse(at)))) : {};
  } catch { return {}; }
}

export function ObservedProjects({ village, activity, error }: { village: DerivedWorkspace; activity?: ActivitySnapshot; error?: string }) {
  const [language, setLanguage] = useState(savedLanguage);
  const [, refreshClock] = useState(0);
  const now = Date.now();
  useEffect(() => {
    // Fresh activity must expire even when a failed poll leaves the snapshot unchanged.
    const timer = window.setInterval(() => refreshClock((tick) => tick + 1), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
  const date = (value: string) => new Date(value).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  useEffect(() => {
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent('agent-village:language', { detail: language }));
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Keep the choice in memory if storage is disabled. */ }
  }, [language]);
  const [selectedId, setSelectedId] = useState<string>();
  const [districtId, setDistrictId] = useState<string>();
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>();
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'brief' | 'timeline' | 'sessions'>('brief');
  const [sessionId, setSessionId] = useState<string>();
  const [read, setRead] = useState(savedRead);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const districtControl = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLElement>();
  const selected = village.projects.find((project) => project.id === selectedId);
  const sessions = village.projects.flatMap((project) => project.observation?.sessions ?? []);
  const roots = sessions.filter((session) => session.role !== 'helper');
  const helpers = sessions.filter((session) => session.role === 'helper');
  const selectedSessions = selected?.observation?.sessions ?? [];
  const selectedHelpers = selectedSessions.filter((session) => session.role === 'helper');
  // The Unassigned inbox is not a project: no building, no plan, listed apart.
  const inbox = village.projects.find((project) => project.observation?.unassigned);
  const inboxRoots = inbox?.observation?.sessions.filter((session) => session.role !== 'helper') ?? [];
  const projects = village.projects.filter((project) => project !== inbox);
  const projectName = (project: { name: string; observation?: { unassigned?: boolean } }) => project.observation?.unassigned ? t('Sessions non classées') : project.name;
  const focusNames = village.observation?.focusProjects ?? [];
  const focused = focusNames.length ? projects.filter((project) => focusNames.includes(project.name)) : projects;
  const candidates = showAll || filter ? projects : focused;
  const visible = candidates.filter((project) => project.name.toLowerCase().includes(filter.toLowerCase()));
  const briefing = villageBriefing([...visible, ...(inbox ? [inbox] : [])].map((project) => ({ id: project.id, name: projectName(project), sessions: project.observation?.sessions ?? [] })), read);
  const provenance = (session: ObservedSession) => {
    if (!session.matchedBy) return t('Signal de cycle de vie seul · projet à identifier');
    const via = session.matchVia && !(session.matchedBy === 'remote' && session.matchVia === 'remote') ? ` (${t(viaLabels[session.matchVia])})` : '';
    return `${t(matchLabels[session.matchedBy])}${via}${session.matchDetail ? ` · ${session.matchDetail}` : ''}`;
  };
  const assignSnippet = `projects:\n  - name: ${t('Mon projet')}\n    sessions: [${inboxRoots[0]?.id ?? 'codex:ID'}]\n    titles: ["^${t('mon-projet')}:"]`;
  const selectedLinks = selected?.observation?.links ?? [];
  const brief = selected && projectBrief(selected.observation?.sessions ?? [], read[selected.id]);
  const district = visible.find((project) => project.id === districtId);
  const mapProjects = district ? [projectDistrict(district)] : visible.slice(0, 9).sort((a, b) => a.id.localeCompare(b.id));
  const mapActivity = activity && { ...activity, workers: activity.workers.filter((worker) => mapProjects.some((project) => project.id === worker.attachedTaskId)) };
  const select = (id: string, element: HTMLElement, milestoneId?: string) => { trigger.current = element; setSelectedId(id); setSelectedMilestoneId(milestoneId); setTab('brief'); setSessionId(undefined); };
  const explore = (id?: string) => {
    setDistrictId(id);
    // A district switch replaces the map, including a house that opened the dialog.
    if (selectedId) { trigger.current = districtControl.current ?? undefined; setSelectedId(undefined); }
    else districtControl.current?.focus();
  };
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
        const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary') ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); (trigger.current?.isConnected ? trigger.current : districtControl.current)?.focus(); };
  }, [selectedId]);

  return <main className="app-shell observed-shell" aria-label={t('Agent Village privé')}>
    <header className="observed-header">
      <div><small>{t('AGENT VILLAGE / LOCAL PRIVÉ')}</small><h1>{t('Journal du village')}</h1><p>{projects.length} {t('projets')} · {roots.length} sessions</p>{helpers.length > 0 && <p>{t('{count} sous-agents détectés', { count: helpers.length })} · {t('historique ≠ activité')}</p>}</div>
      <div><strong>{t('{count} en cours confirmés', { count: sessions.filter((session) => isConfirmedWorking(session, now)).length })}</strong><p>{t('Lu à')} {date(village.observation!.fetchedAt)} · {t('actualisation 5 s')}</p>
        <label className="observed-language">Langue / Language <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="fr">Français</option><option value="en">English</option></select></label>
      </div>
    </header>
    {(error || village.observation?.errors.length !== 0) && <p role="alert" className="observed-warning">{error ? translateDiagnostic(language, error) : village.observation?.errors.map((message) => translateDiagnostic(language, message)).join(' · ')}. {t('Les données déjà lues restent affichées.')}</p>}
    <div className="observed-layout">
      <nav className="observed-projects" aria-label={t('Projets connectés')}>
        <section className="observed-briefing" aria-labelledby="village-briefing-title">
          <header className="observed-briefing__header"><small>{t('Votre point de départ')}</small><h2 id="village-briefing-title">{t('À lire en premier')}</h2><p>{t('Derniers signalements, pas des priorités déduites.')}</p></header>
          <div className="observed-briefing__items">{briefing.map((point) => <button type="button" className="observed-briefing__item" key={point.projectId} aria-label={t('Lire le point de {name}', { name: point.projectName })} onClick={(event) => select(point.projectId, event.currentTarget)}>
            <small className="observed-briefing__kind">{t(point.kind === 'blocked' ? 'Blocage déclaré' : point.kind === 'next' ? 'Suite annoncée' : 'Compte rendu récent')}</small>
            <strong>{point.projectName}</strong><span>{point.entry.text.slice(0, 150)}{point.entry.text.length > 150 ? '…' : ''}</span>
            <time>{point.entry.tool} · {date(point.entry.at)}</time>
          </button>)}</div>
          {briefing.length === 0 && <p className="observed-briefing__empty">{t('Aucun nouveau compte rendu dans les sources lues. Les projets restent consultables.')}</p>}
        </section>
        {inbox && <section className="observed-inbox" aria-labelledby="observed-inbox-title">
          <h2 id="observed-inbox-title">{t('Sessions non classées')} · {inboxRoots.length}</h2>
          <p>{t('Lancées depuis le dossier personnel, /tmp ou sans dossier connu. Pour les ranger, ajoutez une règle dans projects.yaml :')} <code>{`sessions: [${inboxRoots[0]?.id ?? 'codex:ID'}]`}</code></p>
          <button type="button" onClick={(event) => select(inbox.id, event.currentTarget)}>{t('Trier ces sessions')}</button>
        </section>}
        {focusNames.length > 0 && focused.length < projects.length && <button type="button" className="observed-scope" onClick={() => setShowAll(!showAll)}>{showAll ? t('Revenir aux {count} projets suivis', { count: focused.length }) : t('Voir aussi les {count} autres projets', { count: projects.length - focused.length })}</button>}
        <label>{t('Rechercher un projet')}<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('Projet…')} /></label>
        {visible.map((project) => {
          const entries = project.observation?.sessions ?? [];
          const working = entries.filter((entry) => isConfirmedWorking(entry, now)).length;
          const summary = projectBrief(entries, read[project.id]);
          const links = project.observation?.links.length ?? 0;
          const lastAt = summary.latest?.at ?? project.observation?.lastActivityAt;
          return <button type="button" key={project.id} aria-label={t('Ouvrir {name}', { name: project.name })} onClick={(event) => select(project.id, event.currentTarget)}>
            <strong>{project.name}</strong><small>{entries.filter((e) => e.role !== 'helper').length} sessions{links ? ` · ${t('{count} chats liés', { count: links })}` : ''} · {entries.length === 0 ? project.plan ? t('Plan conservé · aucune conversation récente') : t('Aucune conversation observée') : working ? `${working} ${t('en cours')}` : t('Derniers échanges')}</small>
            <small className="observed-project-plan">{project.plan ? t('{done}/{total} jalons validés', { done: project.progress.verified, total: project.progress.total }) : t('Plan à définir')}</small>
            {summary.unread > 0 && <b className="observed-new">{summary.unread} {t('nouveaux échanges')}</b>}
            <span>{summary.latest?.text.slice(0, 90) ?? entries[0]?.objective?.slice(0, 90) ?? t('Ouvrir les sessions')}</span>
            {lastAt && <time>{date(lastAt)}</time>}
          </button>;
        })}
      </nav>
      <section className="game-stage observed-map" aria-label={t('Bâtiments de mes projets')}>
        <nav className="observed-district-nav" aria-label={t('Explorer les quartiers')}>
          <label>{t('Quartier')}<select ref={districtControl} value={district?.id ?? ''} onChange={(event) => explore(event.target.value || undefined)}>
            <option value="">{t('Vue du village')}</option>
            {visible.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></label>
          {district && <button type="button" onClick={() => explore()}>{t('Tous les quartiers')}</button>}
        </nav>
        <VillageMap2D key={district?.id ?? 'overview'} now={now} district={Boolean(district)} language={language} village={{ ...village, projects: mapProjects }} activity={mapActivity} onSelect={(task, element, project) => select(project.id, element, project.plan?.milestones.find((m) => milestoneTaskId(project.id, m.id) === task.id)?.id)} onSelectWorker={(worker, element) => { if (worker.attachedTaskId) { select(worker.attachedTaskId, element); setTab('sessions'); setSessionId(worker.id); } }} />
        <p className="observed-map-note">{district ? t(district.plan ? 'Une parcelle par jalon. La maison commune résume le plan ; les agents y sont regroupés, sans jalon attribué.' : 'Aucun jalon défini : ouvre la maison commune pour préparer le plan.') : t('{count} entrées de quartiers. Choisis un quartier pour voir ses chantiers.', { count: mapProjects.length })}</p>
      </section>
    </div>
    <footer className="observed-footer"><details><summary>{t('Sources et confidentialité')}</summary>{translateDiagnostic(language, village.observation?.historyWindow ?? '')}. {t('Les résumés sont les déclarations des agents, non des résultats vérifiés. Rien n’est envoyé à GitHub.')} {t('Les conversations sources restent dans leur langue d’origine.')}{village.observation?.coverage?.map((note) => <p key={note}>{translateDiagnostic(language, note)}</p>)}</details></footer>
    {selected && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(undefined); }}>
      <aside ref={dialog} className="detail-drawer observed-drawer" role="dialog" aria-modal="true" aria-labelledby="observed-project-title">
        <header className="detail-drawer__header"><div><span>{t(selected === inbox ? 'À trier' : 'Projet connecté')}</span><h2 id="observed-project-title">{projectName(selected)}</h2></div><button ref={close} className="drawer-close" type="button" aria-label={t('Fermer le projet')} onClick={() => setSelectedId(undefined)}>×</button></header>
        <div className="detail-drawer__body">
          <nav className="observed-tabs" aria-label={t('Vue du projet')}><button type="button" aria-pressed={tab === 'brief'} onClick={() => setTab('brief')}>{t('Bilan')}</button><button type="button" aria-pressed={tab === 'timeline'} onClick={() => setTab('timeline')}>{t('Évolution')}</button><button type="button" aria-pressed={tab === 'sessions'} onClick={() => { setTab('sessions'); setSessionId(undefined); }}>{t('Conversations')}</button><button type="button" onClick={markRead}>{t('Marquer comme lu')}</button></nav>
          <p>{t('{count} en cours confirmés', { count: selectedSessions.filter((s) => isConfirmedWorking(s, now)).length })} · {brief?.waiting} {t('en attente')} · {brief?.unread ?? 0} {t('nouveaux échanges depuis le dernier point de lecture.')}</p>
          {tab === 'brief' && brief && <section className="observed-brief">
            {selected === inbox ? <section className="observed-assign" aria-labelledby="observed-assign-title">
              <h3 id="observed-assign-title">{t('Ranger ces sessions')}</h3>
              <p>{t('Aucune règle, aucun dépôt Git et aucun dossier de projet ne les rattache. Ajoutez une règle dans projects.yaml, dans votre dossier privé Agent Village ; elle est relue automatiquement :')}</p>
              <pre><code>{assignSnippet}</code></pre>
              <p className="observed-explanation">{t('Règles possibles : sessions, titles (expression régulière), paths, remotes. Les liens de chats Claude app se déclarent au même endroit (links).')}</p>
            </section> : <>
              {selected.id !== district?.id && <button type="button" className="observed-explore" onClick={() => explore(selected.id)}>{t('Explorer ce quartier')}</button>}
              <ProjectPlanPanel key={selected.id} project={selected} language={language} selectedMilestoneId={selectedMilestoneId} />
            </>}
            <section className="observed-agent-stats" aria-label={t('Agents et observations')}>
              <h3>{t('Agents et observations')}</h3><dl>
                <div className="observed-agent-stats__wide"><dt>{t('Regroupement')}</dt><dd>{selected.observation?.matchedBy.map((by) => t(matchLabels[by])).join(' · ') || (selectedSessions.length ? t('Signal de cycle de vie seul · projet à identifier') : selectedLinks.length ? t('Liens saisis par vous') : '—')}</dd></div>
                <div><dt>{t('Conversations principales')}</dt><dd>{selectedSessions.length - selectedHelpers.length}</dd></div>
                <div><dt>{t('Sous-agents')}</dt><dd>{t('{count} sous-agents détectés', { count: selectedHelpers.length })}</dd></div>
                <div><dt>{t('Activité récente')}</dt><dd>{selectedHelpers.filter((s) => hasRecentActivity(s, now)).length}</dd></div>
                <div><dt>{t('Processus observés')}</dt><dd>{t('{count} en cours confirmés', { count: selectedHelpers.filter((s) => isConfirmedWorking(s, now)).length })}</dd></div>
              </dl><p>{t('Détecté = présent dans les sources. Récent = signal récent. Confirmé = processus observé avec état récent, pas une garantie de travail continu.')}</p>
              <p>{t('Tokens, temps travaillé et durée restante : non mesurés par cette connexion.')}</p>
            </section>
            <h3>{t('Bilan du projet')}</h3>
            <p className="observed-explanation">{t('Extraits des derniers comptes rendus par conversation, datés et consultables. Pas de pourcentage déduit de l’activité.')}</p>
            {brief.current.length === 0 && <p>{t('Aucun compte rendu textuel dans la fenêtre lue. Les sessions et leur état restent accessibles.')}</p>}
            {brief.current.map((entry) => <article key={entry.sessionId}><h4>{entry.sessionTitle}</h4>{source(entry)}<p>{entry.text.slice(0, 700)}{entry.text.length > 700 ? '…' : ''}</p></article>)}
            {(['done', 'next', 'blocked'] as const).map((section) => brief.reported[section].length > 0 && <section key={section}><h3>{t(({ done: 'Fait — déclaré par les agents', next: 'Suite explicitement annoncée', blocked: 'Blocages explicitement signalés' } as const)[section])}</h3><ul>{brief.reported[section].map((entry, index) => <li key={index}><p>{entry.text}</p>{source(entry)}</li>)}</ul></section>)}
          </section>}
          {tab === 'timeline' && <section className="observed-evolution"><h3>{t('Ce qui a changé')}</h3><p>{t('Chronologie réunie de toutes les conversations du projet. Les changements d’état seuls ne sont pas comptés comme du travail livré.')}</p><ol>{brief?.timeline.map((entry, index) => <li key={`${entry.sessionId}:${entry.at}:${index}`}><strong>{t(entry.kind === 'report' ? 'Compte rendu' : 'Demande')}</strong>{source(entry)}<p>{entry.text}</p></li>)}</ol></section>}
          {tab === 'sessions' && sourceGroups.map(([tool, label]) => {
            const list = selectedSessions.filter((session) => (session.tool === tool || (tool === 'other' && !['claude', 'codex', 'openclaw'].includes(session.tool))) && (!sessionId || session.id === sessionId));
            return list.length > 0 && <section className="observed-source-group" key={tool} aria-label={label || t('Autre source')}>
              {!sessionId && <h3 className="observed-source-group__title">{label || t('Autre source')} · {list.length}</h3>}
              {list.map((session) => <article className="observed-session" key={session.id}>
            <header><small>{session.tool.toUpperCase()} · {t(session.role === 'helper' ? 'Sous-agent' : 'Conversation principale')} · {t(states[presentWorkerState(session, true, now)])}</small><h3>{session.title}</h3><time>{date(session.lastActivityAt)}</time></header>
            <p className="observed-provenance">{t('Rattachement : {value}', { value: provenance(session) })}</p>
            {session.activityEvidence && <p>{t(session.activityEvidence.level === 'confirmed' ? 'Activité confirmée' : session.activityEvidence.level === 'recent' ? 'Activité récente' : 'Activité détectée')} · {session.activityEvidence.source} · {date(session.activityEvidence.observedAt)}</p>}
            {session.parentId && <p>{t('Conversation parente')} : {selectedSessions.find((s) => s.id === session.parentId)?.title ?? session.parentId}</p>}
            {session.terminal && <p>{t('Terminal tmux :')} <code>{session.terminal}</code></p>}
            {session.objective && <section><h4>{t('Dernière demande')}</h4><p>{session.objective}</p></section>}
            {session.summary && <section><h4>{t('Dernier compte rendu de l’agent')}</h4><p>{session.summary}</p></section>}
            <section><h4>{t('Historique récent')}</h4><ol>{session.history.slice().reverse().map((update, index) => <li key={`${update.at}:${index}`}><small>{date(update.at)} · {update.kind === 'report' ? 'Agent' : t('Demande')}</small><p>{update.text}</p></li>)}</ol></section>
            <small>{translateDiagnostic(language, session.sourceNote ?? '')} · {session.id}</small>
          </article>)}
            </section>;
          })}
          {tab === 'sessions' && !sessionId && (Object.keys(linkSources) as OwnerLink['source'][]).map((source) => {
            const list = selectedLinks.filter((link) => link.source === source);
            const label = linkSources[source] || t('Autre chat');
            return list.length > 0 && <section className="observed-source-group observed-links" key={`link:${source}`} aria-label={label}>
              <h3 className="observed-source-group__title">{label} · {list.length}</h3>
              <p className="observed-explanation">{t('Saisis par vous dans projects.yaml. Agent Village ne lit ni ne télécharge ces conversations.')}</p>
              <ul>{list.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a> <small>{t('Rattachement : {value}', { value: t('Saisi par vous') })}</small></li>)}</ul>
            </section>;
          })}
          {tab === 'sessions' && !sessionId && selectedSessions.length === 0 && selectedLinks.length === 0 && <p>{t('Aucune conversation observée')}</p>}
        </div>
      </aside>
    </div>}
  </main>;
}
