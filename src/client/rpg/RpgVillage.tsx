import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DerivedProject } from '../../server/truth/derive.js';
import { hasRecentActivity } from '../../shared/workerPresentation.js';
import type { ObservedSession } from '../../shared/observation.js';
import { translate, type Language } from '../language.js';
import { LOTS_PER_MAP, persona, projectRoof, RPG_STATES, sessionState, type RpgState, type Roof } from './model.js';

type Point = [number, number];
type Layer = [x: number, y: number, width: number, height: number];
interface Lot {
  roof: Point;
  center: Point;
  workers: { point: Point; depth: number; crystal: Point }[];
  layers: Record<Roof, Layer>;
}
interface VillageMap {
  frame: Point;
  lots: Lot[];
  inbox: Point;
  stall: Point;
}
interface Props {
  projects: DerivedProject[];
  lots: (string | null)[];
  language: Language;
  now: number;
  selectedId?: string;
  onProject: (id: string, trigger: HTMLElement, sessionId?: string) => void;
  overrides?: Record<string, number>;
  fixture?: true;
}

export const stateLabels = { working: 'Actif', idle: 'Inactif', approval: 'Approbation demandée', input: 'Réponse attendue', error: 'Erreur', offline: 'Hors ligne' } as const;
const icons = { working: '●', idle: '◇', approval: '!', input: '?', error: '▲', offline: '○' };
const needsAttention = (state: RpgState) => state === 'approval' || state === 'input' || state === 'error';
const root = `${import.meta.env.BASE_URL}rpg/`;

function useView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  const [size, setSize] = useState([0, 0]);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const onVisibility = () => setVisible(!document.hidden && onScreen);
    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => { onScreen = entry!.isIntersecting; onVisibility(); });
    const dimensions = new ResizeObserver(([entry]) => setSize([entry!.contentRect.width, entry!.contentRect.height]));
    dimensions.observe(target);
    visibility.observe(target);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => { dimensions.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  return { ref, visible, size };
}

export function RpgVillage({ projects, lots, language, now, selectedId, onProject, overrides, fixture }: Props) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
  const [map, setMap] = useState<VillageMap>();
  const [assetError, setAssetError] = useState(false);
  const [page, setPage] = useState(0);
  const [mobileLot, setMobileLot] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [stall, setStall] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const [motionPreference, setMotionPreference] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { ref, visible, size: [width = 0, height = 0] } = useView<HTMLElement>();
  const spriteObserver = useRef<IntersectionObserver>();
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) (entry.target as HTMLElement).dataset.offscreen = String(!entry.isIntersecting);
    }, { root: stage });
    spriteObserver.current = observer;
    return () => { observer.disconnect(); spriteObserver.current = undefined; };
  }, [ref]);
  useEffect(() => {
    const observer = spriteObserver.current;
    if (!observer) return;
    const sprites = ref.current?.querySelectorAll('.rpg-villager');
    sprites?.forEach((sprite) => observer.observe(sprite));
    return () => sprites?.forEach((sprite) => observer.unobserve(sprite));
  }, [ref, map, width, height, projects, lots, page, selectedId]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotionPreference(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${root}map/map.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Map assets unavailable'); return response.json() as Promise<VillageMap>; })
      .then(setMap).catch(() => { if (!controller.signal.aborted) setAssetError(true); });
    return () => controller.abort();
  }, []);

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const pageCount = Math.max(1, Math.ceil(lots.length / LOTS_PER_MAP));
  const selectedSlot = selectedId ? lots.indexOf(selectedId) : -1;
  const currentPage = selectedSlot >= 0 ? Math.floor(selectedSlot / LOTS_PER_MAP) : Math.min(page, pageCount - 1);
  const pageLots = lots.slice(currentPage * LOTS_PER_MAP, (currentPage + 1) * LOTS_PER_MAP);
  const inbox = projects.find(({ observation }) => observation?.unassigned);
  const links = [...new Map(projects.flatMap(({ observation }) => (observation?.links ?? [])
    .filter((link) => link.source === 'claude-app').map((link) => [link.url, link] as const))).values()];
  const mobile = width > 0 && width < 620;
  const focus = selectedId ?? (mobile ? (pageLots.includes(mobileLot ?? '') ? mobileLot : pageLots.find(Boolean)) : undefined);
  const focusLot = map?.lots[pageLots.indexOf(focus ?? '')];
  const focused = Boolean(focusLot);
  const reduceMotion = !motion || motionPreference;
  const requests = projects.flatMap((project) => (project.observation?.sessions ?? []).flatMap((session) => {
    const state = sessionState(session, now);
    return needsAttention(state) ? [{ project, session, state, at: session.attention?.at ?? session.failure?.at ?? session.lastActivityAt }] : [];
  })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const recent = projects.flatMap((project) => (project.observation?.sessions ?? [])
    .filter((session) => hasRecentActivity(session, now)).map((session) => ({ project, session })))
    .sort((a, b) => Date.parse(b.session.activityEvidence!.observedAt) - Date.parse(a.session.activityEvidence!.observedAt)).slice(0, 3);
  const point = ([x, y]: Point): CSSProperties => ({ left: `${x / map!.frame[0] * 100}%`, top: `${y / map!.frame[1] * 100}%` });
  const layer = ([x, y, w, h]: Layer): CSSProperties => ({ ...point([x, y]), width: `${w / map!.frame[0] * 100}%`, height: `${h / map!.frame[1] * 100}%` });
  const fit = map ? (focused ? Math.min(width / map.frame[0], height / map.frame[1])
    : Math.max(width / map.frame[0], height / map.frame[1])) : 0;
  const scale = fit * zoom * (focused ? mobile ? 3.8 : 2 : 1);
  const center = focusLot ? [focusLot.center[0], (focusLot.center[1] + focusLot.roof[1]) / 2 + 55] : map?.frame.map((value) => value / 2);
  const villagers = map?.lots.flatMap((lot, index) => {
    const project = projectsById.get(pageLots[index] ?? '');
    if (!project) return [];
    const sessions = (project.observation?.sessions ?? []).flatMap((session) => {
      const sprite = persona(session, overrides?.[session.id]);
      return sprite ? [{ session, sprite, state: sessionState(session, now) }] : [];
    }).sort((a, b) => Number(needsAttention(b.state)) - Number(needsAttention(a.state))
      || Date.parse(b.session.lastActivityAt) - Date.parse(a.session.lastActivityAt)
      || a.session.id.localeCompare(b.session.id));
    return sessions.slice(0, lot.workers.length).map((entry, i) => ({ ...entry, project, ...lot.workers[i]! }));
  }).sort((a, b) => a.depth - b.depth) ?? [];
  const name = (session: ObservedSession) => session.title || session.tool;

  return <div className="rpg-layout" data-reduced={reduceMotion} data-paused={!visible}>
    <section className="rpg-stage" aria-label={t('Carte du village')} ref={ref}>
      {map && width > 0 && height > 0 && <div className="rpg-map" style={{
        width: map.frame[0] * scale, height: map.frame[1] * scale,
        left: width / 2 - center![0]! * scale, top: height / 2 - center![1]! * scale,
      }}>
        <img className="rpg-base" src={`${root}map/base.webp`} alt="" />
        {map.lots.map((lot, index) => {
          const project = projectsById.get(pageLots[index] ?? '');
          if (!project) return <span className="rpg-empty rpg-window" key={index} style={point(lot.center)}>{t('Terrain libre')}</span>;
          const roof = projectRoof(project.id);
          return <img key={project.id} className="rpg-house" data-dim={focused && focus !== project.id}
            style={{ ...layer(lot.layers[roof]), zIndex: Math.round(lot.center[1] * 2) }} src={`${root}map/house-${index}-${roof}.webp`} alt="" />;
        })}
        {villagers.map((entry) => <div key={entry.session.id}>
          {entry.state !== 'offline' && <span className="rpg-crystal" data-state={entry.state} data-dim={focused && focus !== entry.project.id}
            style={{ ...point(entry.crystal), zIndex: Math.round(entry.point[1] * 2) - 1, width: 15 * scale, height: 19 * scale }} aria-hidden="true" />}
          <button type="button" className="rpg-villager" data-state={entry.state}
          data-dim={focused && focus !== entry.project.id} tabIndex={focused && focus !== entry.project.id ? -1 : undefined} aria-label={`${name(entry.session)} · ${t(stateLabels[entry.state])}`}
          title={`${name(entry.session)} · ${t(stateLabels[entry.state])}`}
          style={{ ...point(entry.point), zIndex: Math.round(entry.point[1] * 2), '--sprite-size': `${300 * scale}px`, '--sheet': `url("${root}sprites/${entry.sprite}-${entry.state}.webp")` } as CSSProperties}
          onClick={(event) => onProject(entry.project.id, event.currentTarget, entry.session.id)}>
          <span className="rpg-sprite" aria-hidden="true" />
          {needsAttention(entry.state) && <span className="rpg-emote" aria-hidden="true">{icons[entry.state]}</span>}
          {focus === entry.project.id && <span className="rpg-name rpg-window" aria-hidden="true">{name(entry.session)}</span>}
          </button>
        </div>)}
        {map.lots.map((lot, index) => {
          const project = projectsById.get(pageLots[index] ?? '');
          if (!project) return null;
          const sessions = project.observation?.sessions ?? [];
          return <button key={project.id} type="button" className="rpg-plate rpg-window"
            tabIndex={focused && focus !== project.id ? -1 : undefined} aria-label={t('Ouvrir {name}', { name: project.name })} aria-pressed={selectedId === project.id}
            data-dim={focused && focus !== project.id} style={point(lot.roof)} onClick={(event) => onProject(project.id, event.currentTarget)}>
            {selectedId === project.id && '▶ '}{project.name} <small>{sessions.length}</small>
          </button>;
        })}
        {inbox && <button type="button" className="rpg-landmark rpg-window" style={point(map.inbox)} onClick={(event) => onProject(inbox.id, event.currentTarget)}>{t('Sessions non classées')}</button>}
        <button type="button" className="rpg-landmark rpg-window" style={point(map.stall)} aria-expanded={stall} onClick={() => setStall(!stall)}>Claude app</button>
      </div>}
      {selectedId && requests.some(({ project }) => project.id === selectedId) && <div className="rpg-dialogues" aria-hidden="true">
        {requests.filter(({ project }) => project.id === selectedId).slice(0, 2).map(({ session, state }) => <div key={session.id} className="rpg-window rpg-dialogue" data-state={state}>
          <small>{icons[state]} {t(stateLabels[state])}</small><span>{name(session)}</span>
        </div>)}
      </div>}
      {fixture && <b className="rpg-stage-demo rpg-demo-badge">{t('DÉMO')}</b>}
      {!focused && recent.length > 0 && <section className="rpg-activity rpg-window" aria-label={t('Activité récente')}>
        <h2>{t('Activité récente')}</h2>
        <ul>{recent.map(({ project, session }) => <li key={session.id}><button type="button" onClick={(event) => onProject(project.id, event.currentTarget, session.id)}>
          <time>{new Date(session.activityEvidence!.observedAt).toLocaleTimeString(language === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}</time> {name(session)}
        </button></li>)}</ul>
      </section>}
      {!map && <p className="rpg-map-message" role={assetError ? 'alert' : 'status'}>{t(assetError ? 'Carte indisponible. Ouvrez la liste.' : 'Chargement de la carte…')}</p>}
      {stall && <section className="rpg-stall rpg-window" aria-label="Claude app"><button type="button" aria-label={t('Fermer')} onClick={() => setStall(false)}>×</button>
        <h2>Claude app</h2><p>{t('Historique indisponible')}</p>
        {links.length > 0 && <ul>{links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a></li>)}</ul>}
      </section>}
      <div className="rpg-map-controls">
        <ul className="rpg-legend rpg-window" aria-label={t('États des agents')}>{RPG_STATES.map((state) => <li key={state} data-state={state}><i aria-hidden="true">{icons[state]}</i> {t(stateLabels[state])}</li>)}</ul>
        <div className="rpg-controls rpg-window">
          {pageCount > 1 && <><button type="button" aria-label={t('Carte précédente')} disabled={currentPage === 0 || selectedSlot >= 0} onClick={() => setPage(currentPage - 1)}>‹</button><span>{currentPage + 1}/{pageCount}</span><button type="button" aria-label={t('Carte suivante')} disabled={currentPage >= pageCount - 1 || selectedSlot >= 0} onClick={() => setPage(currentPage + 1)}>›</button></>}
          <button type="button" aria-label={t('Agrandir')} disabled={zoom >= 1.5} onClick={() => setZoom(Math.min(1.5, zoom + 0.25))}>+</button>
          <button type="button" aria-label={t('Réduire')} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.25))}>−</button>
          <button type="button" aria-pressed={reduceMotion} disabled={motionPreference} onClick={() => setMotion(!motion)}>{t('Mouvement réduit')}</button>
        </div>
      </div>
      {mobile && pageLots.some(Boolean) && <nav className="rpg-project-strip" aria-label={t('Projets connectés')}>{pageLots.map((id) => {
        const project = projectsById.get(id ?? '');
        return project && <button type="button" key={project.id} aria-pressed={focus === project.id} onClick={() => setMobileLot(project.id)}>{project.name}</button>;
      })}</nav>}
    </section>
    <aside className="rpg-attention" data-open={attentionOpen} aria-label={t('À vous de jouer')}>
      <button className="rpg-window rpg-attention-toggle" type="button" aria-expanded={attentionOpen} onClick={() => setAttentionOpen(!attentionOpen)}>{t('À vous de jouer')} · {requests.length}</button>
      <div className="rpg-attention-content">
        <h2>{t('À vous de jouer')} <small>{requests.length}</small></h2>
        {requests.length === 0 && <p>{t('Aucune demande confirmée.')}</p>}
        {(['error', 'approval', 'input'] as const).map((state) => {
          const items = requests.filter((request) => request.state === state);
          return items.length > 0 && <section key={state} data-state={state}><h3>{icons[state]} {t(stateLabels[state])}</h3>
            {items.map(({ project, session, at }) => <button type="button" className="rpg-request rpg-window" key={session.id}
              onClick={(event) => onProject(project.id, event.currentTarget, session.id)}>
              <strong>{name(session)}</strong><span>{project.observation?.unassigned ? t('Sessions non classées') : project.name}</span>
              <time dateTime={at}>{new Date(at).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time>
              <small>▶ {t('Ouvrir la conversation')}</small>
            </button>)}
          </section>;
        })}
      </div>
    </aside>
  </div>;
}
