import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardSnapshot } from '../../shared/board.js';
import { buildBoardView, indexProjects, projectTimeline, resumeCommand, sinceLastVisit, type VisitMarks } from '../../shared/boardView.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { LANGUAGE_KEY, savedLanguage, translateDiagnostic, type Language } from '../language.js';
import { AttentionInbox } from './AttentionInbox.js';
import { absolute, translator } from './format.js';
import { ProjectDetail } from './ProjectDetail.js';
import { ProjectList } from './ProjectList.js';
import { SinceLastVisit } from './SinceLastVisit.js';
import { SourceBar } from './SourceBar.js';
import { loadSeen, loadSnoozed, loadVisit, saveSeen, saveSnoozed, saveVisit } from './storage.js';
import { UnmatchedInbox } from './UnmatchedInbox.js';
import './board.css';

interface Anchor { container: Element; key: string; offset: number }
declare global { interface Window { __agentVillageRender?: { samples: { seq: number; ms: number }[] } } }

const FRESH_MS = 1_400;
const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function scrollContainers(root: HTMLElement | null): Element[] {
  const columns = root ? [...root.querySelectorAll('[data-scroll-column]')] : [];
  return [...columns, document.scrollingElement ?? document.documentElement];
}
/** First visible anchored element of each scroll container, so applied changes insert outside the viewport. */
function captureAnchors(root: HTMLElement | null): Anchor[] {
  return scrollContainers(root).flatMap((container) => {
    const top = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
    const scope = container === document.scrollingElement ? root : container;
    const element = [...(scope?.querySelectorAll('[data-anchor]') ?? [])].find((node) => node.getBoundingClientRect().bottom > top + 1);
    return element ? [{ container, key: element.getAttribute('data-anchor')!, offset: element.getBoundingClientRect().top - top }] : [];
  });
}
function restoreAnchors(root: HTMLElement | null, anchors: Anchor[]): void {
  for (const anchor of anchors) {
    const top = anchor.container === document.scrollingElement ? 0 : anchor.container.getBoundingClientRect().top;
    const scope = anchor.container === document.scrollingElement ? root : anchor.container;
    const element = [...(scope?.querySelectorAll('[data-anchor]') ?? [])].find((node) => node.getAttribute('data-anchor') === anchor.key);
    if (!element) continue;
    const delta = element.getBoundingClientRect().top - top - anchor.offset;
    if (Math.abs(delta) >= 1) anchor.container.scrollTop += delta;
  }
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!);
}

export function BoardApp({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const feed = useEventStream(fetchImpl);
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const t = useMemo(() => translator(language), [language]);
  // Re-render every 15 s so ages advance; every render reads the wall clock itself.
  const [, setTick] = useState(0);
  const [openId, setOpenId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [conversation, setConversation] = useState<string>();
  const [editPlan, setEditPlan] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [frozen, setFrozen] = useState<{ snapshot: BoardSnapshot; now: number }>();
  const [visit, setVisit] = useState<VisitMarks | undefined>(loadVisit);
  const [seen, setSeen] = useState<Record<string, true>>(loadSeen);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => loadSnoozed(Date.now()));
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [latency, setLatency] = useState<{ p95: number; count: number }>();
  const root = useRef<HTMLElement>(null);
  const detail = useRef<HTMLElement>(null);
  const anchors = useRef<Anchor[]>();
  const live = feed.snapshot;
  const reading = Boolean(openId) || pointerInside || focusInside;
  const shown = frozen?.snapshot ?? live;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  // Pointer presence from document-level boundary events: robust when the hovered element is
  // removed (closing the detail) and when the pointer leaves the window.
  const readingArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const over = (event: PointerEvent) => {
      const inside = Boolean(readingArea.current?.contains(event.target as Node));
      setPointerInside(inside);
      if (inside) freezeRef.current();
    };
    const out = (event: PointerEvent) => { if (!event.relatedTarget) setPointerInside(false); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out); };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent('agent-village:language', { detail: language }));
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* In-memory preference. */ }
  }, [language]);

  // Reading freeze: attention, digest, list and detail stop changing while the owner reads.
  const freeze = useCallback(() => {
    setFrozen((current) => current ?? (shownRef.current ? { snapshot: shownRef.current, now: Date.now() } : undefined));
  }, []);
  const freezeRef = useRef(freeze);
  freezeRef.current = freeze;
  useEffect(() => {
    if (reading) freeze();
    else if (frozen) { anchors.current = captureAnchors(root.current); setFrozen(undefined); }
  }, [reading, frozen, freeze]);
  const apply = () => {
    if (!live) return;
    anchors.current = captureAnchors(root.current);
    setFrozen(reading ? { snapshot: live, now: Date.now() } : undefined);
  };
  useLayoutEffect(() => {
    if (anchors.current) { restoreAnchors(root.current, anchors.current); anchors.current = undefined; }
  }, [shown]);

  const fictional = shown?.fictional ?? false;
  // Live ages use this render's wall clock (the 15-second tick only forces a re-render);
  // a fictional snapshot keeps its capture time, a frozen view the time it was frozen.
  const wallNow = Date.now();
  const now = fictional && shown ? Date.parse(shown.generatedAt) : frozen ? frozen.now : wallNow;
  const view = useMemo(() => shown ? buildBoardView(shown, now) : undefined, [shown, now]);
  const digest = useMemo(() => shown ? sinceLastVisit(shown, visit, now) : undefined, [shown, visit, now]);
  const pending = frozen && live ? (live.epoch !== frozen.snapshot.epoch ? 1 : Math.max(0, live.seq - frozen.snapshot.seq)) : 0;

  // Brief highlight (≤ 1.4 s, CSS-only, disabled under reduced motion) for rows that received an
  // observed event. The timer is independent of later renders: a context-only update can neither
  // keep a row highlighted nor cancel its expiry, and a newer event restarts the highlight.
  const previous = useRef<{ epoch: string; seq: number }>();
  const freshTimer = useRef<number>();
  const freshFrame = useRef<number>();
  useEffect(() => () => { window.clearTimeout(freshTimer.current); window.cancelAnimationFrame(freshFrame.current ?? 0); }, []);
  useEffect(() => {
    if (!shown) return;
    const before = previous.current;
    previous.current = { epoch: shown.epoch, seq: shown.seq };
    if (!before || before.epoch !== shown.epoch || shown.seq <= before.seq) return;
    const changed = new Set<string>();
    for (const [projectId, project] of indexProjects(shown).projects) {
      if (project.sessions.some((session) => session.seq > before.seq) || project.facts.some((fact) => fact.seq > before.seq)) changed.add(projectId);
    }
    if (changed.size === 0) return;
    window.clearTimeout(freshTimer.current);
    window.cancelAnimationFrame(freshFrame.current ?? 0);
    // Remove, then re-add on the next frame so the CSS animation restarts for rows already lit.
    setFresh(new Set());
    freshFrame.current = window.requestAnimationFrame(() => setFresh(changed));
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
  }, [shown]);

  // Render latency: server receivedAt → this commit, for events rendered live (not while frozen).
  const measured = useRef(0);
  useEffect(() => {
    if (!shown || frozen) return;
    const samples = window.__agentVillageRender ??= { samples: [] };
    const at = Date.now();
    for (const event of feed.received) {
      if (event.seq <= measured.current || event.seq > shown.seq) continue;
      samples.samples.push({ seq: event.seq, ms: at - Date.parse(event.receivedAt) });
    }
    measured.current = Math.max(measured.current, shown.seq);
    if (samples.samples.length > 500) samples.samples.splice(0, samples.samples.length - 500);
    if (samples.samples.length) setLatency({ p95: p95(samples.samples.map((sample) => sample.ms)), count: samples.samples.length });
  }, [shown, frozen, feed.received]);

  const rows = view?.rows ?? [];
  const open = (id: string, options: { edit?: boolean; session?: string } = {}) => {
    freeze();
    setOpenId(id); setSelectedId(id); setEditPlan(Boolean(options.edit)); setConversation(options.session);
  };
  const close = () => {
    const id = openId;
    setOpenId(undefined); setConversation(undefined); setEditPlan(false);
    if (id) window.requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-project-id="${CSS.escape(id)}"] .project-row__main`)?.focus());
  };
  useEffect(() => { if (openId) detail.current?.focus(); }, [openId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openId) { event.preventDefault(); close(); return; }
      if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'j' || event.key === 'k') {
        if (rows.length === 0) return;
        event.preventDefault();
        const index = rows.findIndex((row) => row.id === selectedId);
        const next = rows[Math.max(0, Math.min(rows.length - 1, index < 0 ? 0 : index + (event.key === 'j' ? 1 : -1)))]!;
        setSelectedId(next.id);
        root.current?.querySelector<HTMLButtonElement>(`[data-project-id="${CSS.escape(next.id)}"] .project-row__main`)?.focus();
      } else if (event.key === 'Enter' && selectedId && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLAnchorElement)) {
        event.preventDefault(); open(selectedId);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!shown || !view || !digest) {
    return <main className="board board--center" aria-label="Agent Village">
      {feed.error ? <section role="alert" className="board-alert"><strong>{t('Tableau indisponible.')}</strong> {feed.error}</section> : <p role="status">{t('Chargement du tableau…')}</p>}
    </main>;
  }

  const visibleAttention = view.attention.filter((item) => !seen[item.id] && !((snoozed[item.id] ?? 0) > wallNow));
  const markVisit = (projectId?: string) => {
    const base: VisitMarks = visit && visit.epoch === shown.epoch ? visit : { epoch: shown.epoch, global: null, projects: {} };
    const next: VisitMarks = projectId ? { ...base, projects: { ...base.projects, [projectId]: shown.seq } } : { epoch: shown.epoch, global: shown.seq, projects: {} };
    setVisit(next); saveVisit(next);
  };
  const openRow = openId ? rows.find((row) => row.id === openId) : undefined;
  const sessionsOf = (id: string) => Object.values(shown.state.sessions).filter((session) => indexProjects(shown).projects.get(id)?.sessions.some((entry) => entry.id === session.id));
  const modeLabel = shown.mode === 'truth-only' ? t('Mode YAML vérité seule') : shown.mode === 'live' ? t('Mode YAML + activité AMC locale') : undefined;

  return <main ref={root} className="board" aria-label="Agent Village" data-seq={shown.seq} data-live-seq={live?.seq} data-frozen={frozen ? 'true' : undefined}>
    <header className="board__header">
      <div>
        <small>{t(fictional ? 'AGENT VILLAGE · DÉMO FICTIVE' : 'AGENT VILLAGE · LOCAL PRIVÉ')}</small>
        <h1>{t('Tableau des opérations')}</h1>
        {modeLabel && <p>{modeLabel}</p>}
      </div>
      <label className="board__language">Langue / Language <select aria-label="Langue / Language" value={language} onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'fr')}>
        <option value="fr">Français</option><option value="en">English</option></select></label>
    </header>
    {fictional && <p className="board-banner" role="note">{t('Données fictives · instantané du {date}. Aucune donnée réelle, aucune connexion.', { date: absolute(language, shown.generatedAt) })}</p>}
    {shown.errors.length > 0 && <p className="board-alert" role="alert">{shown.errors.map((error) => translateDiagnostic(language, error)).join(' · ')} {t('Les données déjà lues restent affichées.')}</p>}
    <SourceBar health={live?.health ?? shown.health} feed={feed.status} lastSignalAt={feed.lastSignalAt} now={fictional ? now : wallNow} clockNow={wallNow}
      language={language} t={t} latency={latency} pending={pending} reset={Boolean(frozen && live && live.epoch !== frozen.snapshot.epoch)} onApply={apply} />
    <div ref={readingArea} className={`board__reading${openRow ? ' has-detail' : ''}`}
      onFocus={() => { setFocusInside(true); freeze(); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false); }}>
      <div className="board__column board__inbox" data-scroll-column>
        <AttentionInbox items={visibleAttention} hidden={view.attention.length - visibleAttention.length} t={t} language={language} now={now}
          resume={(sessionId) => resumeCommand(sessionId ? shown.state.sessions[sessionId] : undefined)} canValidate={shown.capabilities.editPlans}
          onOpen={(id) => open(id)} onValidate={(id) => open(id, { edit: true })} onSession={(projectId, sessionId) => projectId && open(projectId, { session: sessionId })}
          onSeen={(id) => setSeen((current) => { const next = { ...current, [id]: true as const }; saveSeen(next); return next; })}
          onSnooze={(id, until) => setSnoozed((current) => { const next = { ...current, [id]: until }; saveSnoozed(next); return next; })}
          onRestore={() => { setSeen({}); saveSeen({}); setSnoozed({}); saveSnoozed({}); }} />
        <SinceLastVisit groups={digest.groups} firstVisit={digest.firstVisit} t={t} language={language} now={now}
          onOpen={(id) => open(id)} onSeen={(id) => markVisit(id)} onSeenAll={() => markVisit()} onSession={(projectId, sessionId) => projectId && open(projectId, { session: sessionId })} />
        <UnmatchedInbox sessions={view.unmatched} projects={rows} canMap={shown.capabilities.mapProjects} t={t} language={language} now={now} />
      </div>
      <div className="board__column board__list" data-scroll-column>
        <ProjectList rows={rows} selectedId={selectedId} openId={openId} fresh={fresh} t={t} language={language} now={now} onSelect={setSelectedId} onOpen={(id) => open(id)} />
      </div>
      {openRow && <div className="board__column board__detail" data-scroll-column>
        <ProjectDetail ref={detail} row={openRow} snapshot={shown} timeline={projectTimeline(shown, openRow.id)} sessions={sessionsOf(openRow.id)} conversation={conversation}
          editPlan={editPlan} t={t} language={language} now={now} onClose={close} onConversation={setConversation} onSeen={() => markVisit(openRow.id)} />
      </div>}
    </div>
  </main>;
}
