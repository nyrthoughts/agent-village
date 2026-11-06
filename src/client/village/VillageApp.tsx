import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSnapshot } from '../../shared/board.js';
import { sessionProject } from '../../shared/projector.js';
import { buildBoardView, indexProjects, projectTimeline, resumeCommand, sinceLastVisit, type VisitMarks } from '../../shared/boardView.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { LANGUAGE_KEY, savedLanguage, translateDiagnostic, type Language } from '../language.js';
import { AttentionInbox } from '../board/AttentionInbox.js';
import { absolute, CopyButton, translator } from '../board/format.js';
import { ProjectDetail, SessionConversation } from '../board/ProjectDetail.js';
import { SourceBar } from '../board/SourceBar.js';
import { SinceLastVisit } from '../board/SinceLastVisit.js';
import { UnmatchedInbox } from '../board/UnmatchedInbox.js';
import { loadSeen, loadSnoozed, loadVisit, saveSeen, saveSnoozed, saveVisit } from '../board/storage.js';
import { VillageScene } from './VillageScene.js';
import '../board/board.css';
import './village.css';

declare global { interface Window { __agentVillageRender?: { samples: { seq: number; ms: number }[] } } }

export function VillageApp({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const feed = useEventStream(fetchImpl);
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const t = useMemo(() => translator(language), [language]);
  const [, setTick] = useState(0);
  const [openId, setOpenId] = useState<string>();
  const [overlayMode, setOverlayMode] = useState<'detail' | 'attention' | undefined>();
  const [conversation, setConversation] = useState<string>();
  const [editPlan, setEditPlan] = useState(false);
  const [frozen, setFrozen] = useState<{ snapshot: BoardSnapshot; now: number }>();
  const [visit, setVisit] = useState<VisitMarks | undefined>(loadVisit);
  const [seen, setSeen] = useState<Record<string, true>>(loadSeen);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => loadSnoozed(Date.now()));
  const detail = useRef<HTMLElement>(null);
  const live = feed.snapshot;
  const shown = frozen?.snapshot ?? live;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* ok */ }
  }, [language]);

  const freeze = useCallback(() => {
    setFrozen((c) => c ?? (shownRef.current ? { snapshot: shownRef.current, now: Date.now() } : undefined));
  }, []);

  const fictional = shown?.fictional ?? false;
  const wallNow = Date.now();
  const now = fictional && shown ? Date.parse(shown.generatedAt) : frozen ? frozen.now : wallNow;
  const view = useMemo(() => shown ? buildBoardView(shown, now) : undefined, [shown, now]);
  const digest = useMemo(() => shown ? sinceLastVisit(shown, visit, now) : undefined, [shown, visit, now]);
  const rows = view?.rows ?? [];

  const openProject = (id: string, opts: { edit?: boolean; session?: string } = {}) => {
    freeze();
    setOpenId(id); setOverlayMode('detail'); setEditPlan(Boolean(opts.edit)); setConversation(opts.session);
  };
  const openAgentSession = (sessionId: string) => {
    const projectId = shown && sessionProject(shown.state, sessionId);
    if (projectId) openProject(projectId, { session: sessionId });
    else { freeze(); setOpenId(undefined); setOverlayMode('detail'); setConversation(sessionId); }
  };
  const openAttention = () => { freeze(); setOverlayMode('attention'); };
  const closeOverlay = () => { setOpenId(undefined); setOverlayMode(undefined); setConversation(undefined); setEditPlan(false); setFrozen(undefined); };

  useEffect(() => {
    if (!overlayMode) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    detail.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
      if (event.key !== 'Tab' || !detail.current) return;
      const controls = [...detail.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]')];
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === detail.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !detail.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [openId, overlayMode, conversation]);

  if (!shown || !view || !digest) {
    return <div className="village-stage">
      <div className="village-header"><span className="village-header__title">{t('AGENT VILLAGE')}</span></div>
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#e7e9ea' }}>
        {feed.error ? <p role="alert" style={{ color: '#f4212e' }}>{t('Tableau indisponible.')} {feed.error}</p> : <p role="status">{t('Chargement du village…')}</p>}
      </div>
    </div>;
  }

  const visibleAttention = view.attention.filter((item) => !seen[item.id] && !((snoozed[item.id] ?? 0) > wallNow));
  const markVisit = (projectId?: string) => {
    const base: VisitMarks = visit && visit.epoch === shown.epoch ? visit : { epoch: shown.epoch, global: null, projects: {} };
    const next: VisitMarks = projectId ? { ...base, projects: { ...base.projects, [projectId]: shown.seq } } : { epoch: shown.epoch, global: shown.seq, projects: {} };
    setVisit(next); saveVisit(next);
  };
  const openRow = openId ? rows.find((r) => r.id === openId) : undefined;
  const sessionsOf = (id: string) => Object.values(shown.state.sessions).filter((s) => indexProjects(shown).projects.get(id)?.sessions.some((e) => e.id === s.id));
  const pending = frozen && live ? (live.epoch !== frozen.snapshot.epoch ? 1 : Math.max(0, live.seq - frozen.snapshot.seq)) : 0;
  const apply = () => setFrozen(undefined);
  const pendingNotice = <div className="village-pending-slot">
    {pending > 0 ? <button type="button" className="village-updates" onClick={apply}>
      {live?.epoch !== frozen?.snapshot.epoch ? t('Nouveau journal — appliquer') : t('{count} changements — appliquer', { count: pending })}
    </button> : <small>{t('Affichage figé pendant la lecture.')}</small>}
  </div>;

  return <div className="village-stage">
    <div className="village-header">
      <span className="village-header__title">{t(fictional ? 'AGENT VILLAGE · DÉMO' : 'AGENT VILLAGE')}</span>
      <button type="button" className="village-attention" onClick={openAttention}>
        {t('À toi')} ({visibleAttention.length})
      </button>
      <details className="village-header__sources"><summary>{t('Sources')}</summary>
        <SourceBar health={live?.health ?? shown.health} feed={feed.status} lastSignalAt={feed.lastSignalAt} now={fictional ? now : wallNow} clockNow={wallNow}
          language={language} t={t} pending={0} reset={false} onApply={apply} />
      </details>
      <span className="village-header__feed">{feed.status === 'live' ? '● Live' : feed.status}</span>
      {fictional && <span style={{ fontSize: 10, opacity: .6 }}>{t('Données fictives · {date}', { date: absolute(language, shown.generatedAt) })}</span>}
      {shown.errors.length > 0 && <span style={{ fontSize: 10, color: '#f4212e' }}>{shown.errors.map((e) => translateDiagnostic(language, e)).join(' · ')}</span>}
      <label className="village-header__language">
        <select aria-label="Langue / Language" value={language} onChange={(e) => setLanguage(e.target.value === 'en' ? 'en' : 'fr')}>
          <option value="fr">FR</option><option value="en">EN</option>
        </select>
      </label>
    </div>

    <VillageScene snapshot={shown} now={now} t={t} language={language} onSelectProject={(id) => openProject(id)} onSelectAgent={openAgentSession} />

    {overlayMode === 'detail' && (openRow || conversation) && <div className="village-overlay" role="dialog" aria-modal="true" aria-label={t('Détail du projet')}>
      <div className="village-overlay__backdrop" onClick={closeOverlay} />
      <div className="village-overlay__panel">
        {openRow ? <ProjectDetail ref={detail} row={openRow} snapshot={shown} timeline={projectTimeline(shown, openRow.id)} sessions={sessionsOf(openRow.id)} conversation={conversation}
          editPlan={editPlan} t={t} language={language} now={now} onClose={closeOverlay} onConversation={setConversation} onSeen={() => markVisit(openRow.id)} notice={pendingNotice} />
          : <aside ref={detail} className="detail" tabIndex={-1}>
            {pendingNotice}
            <header className="detail__header"><h2>{shown.state.sessions[conversation!]?.title}</h2>
              <button type="button" className="detail__close" aria-label={t('Fermer le détail')} onClick={closeOverlay}>×</button></header>
            <SessionConversation snapshot={shown} sessionId={conversation!} t={t} language={language} now={now} onBack={closeOverlay} />
            {resumeCommand(shown.state.sessions[conversation!]) && <CopyButton text={resumeCommand(shown.state.sessions[conversation!])!} label={t('Copier la reprise')} t={t} />}
          </aside>}
      </div>
    </div>}

    {overlayMode === 'attention' && <div className="village-overlay" role="dialog" aria-modal="true" aria-label={t('À toi')}>
      <div className="village-overlay__backdrop" onClick={closeOverlay} />
      <section ref={detail} tabIndex={-1} className="village-overlay__panel" style={{ padding: '12px 16px' }}>
        {pendingNotice}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, font: '700 18px/1.2 ui-sans-serif, system-ui, sans-serif' }}>{t('À toi')}</h2>
          <button type="button" className="detail__close" aria-label={t('Fermer le détail')} onClick={closeOverlay}>×</button>
        </div>
        <AttentionInbox items={visibleAttention} hidden={view.attention.length - visibleAttention.length} t={t} language={language} now={now}
          resume={(sid) => resumeCommand(sid ? shown.state.sessions[sid] : undefined)} canValidate={shown.capabilities.editPlans}
          onOpen={(id) => { setOverlayMode('detail'); openProject(id); }} onValidate={(id) => openProject(id, { edit: true })}
          onSession={(pid, sid) => pid && openProject(pid, { session: sid })}
          onSeen={(id) => setSeen((c) => { const next = { ...c, [id]: true as const }; saveSeen(next); return next; })}
          onSnooze={(id, until) => setSnoozed((c) => { const next = { ...c, [id]: until }; saveSnoozed(next); return next; })}
          onRestore={() => { setSeen({}); saveSeen({}); setSnoozed({}); saveSnoozed({}); }} />
        <SinceLastVisit groups={digest.groups} firstVisit={digest.firstVisit} t={t} language={language} now={now}
          onOpen={(id) => openProject(id)} onSeen={(id) => markVisit(id)} onSeenAll={() => markVisit()} onSession={(pid, sid) => pid && openProject(pid, { session: sid })} />
        <UnmatchedInbox sessions={view.unmatched} projects={rows} canMap={shown.capabilities.mapProjects} t={t} language={language} now={now} />
      </section>
    </div>}
  </div>;
}
