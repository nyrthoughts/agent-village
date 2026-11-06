import { sourceStatus, type SourceHealth } from '../../shared/board.js';
import type { FeedStatus } from '../hooks/useEventStream.js';
import { translateDiagnostic, type Language } from '../language.js';
import { absolute, relative, type Translate } from './format.js';

const STATUS_LABEL = { ok: 'OK', stale: 'Ancienne', unreachable: 'Inaccessible', waiting: 'En attente du premier relevé', paused: 'En pause (verrouillé)', fixture: 'Fictif' } as const;
const FEED_LABEL = { connecting: 'Connexion…', live: 'Flux en direct', reconnecting: 'Reconnexion · sondage 5 s en attendant', polling: 'Sondage toutes les 5 s', static: 'Instantané statique', offline: 'Hors ligne' } as const;

/** Age of a past signal at `now`; a timestamp a few milliseconds ahead of this clock reads as "now", never "in N seconds". */
export function pastAge(language: Language, value: string, now: number): string {
  return relative(language, value, Math.max(now, Date.parse(value)));
}

/**
 * Always-visible health: every source with its age; stale beyond 3× cadence, unreachable after
 * a failure. `now` is the wall clock of this render (capture time for a fictional snapshot).
 * The apply slot is always laid out, so a pending-changes button never shifts the reading area.
 */
export function SourceBar({ health, feed, lastSignalAt, now, clockNow, language, t, latency, pending, onApply, reset }: {
  health: SourceHealth[]; feed: FeedStatus; lastSignalAt?: number; now: number; clockNow: number; language: Language; t: Translate;
  latency?: { p95: number; count: number }; pending: number; onApply: () => void; reset: boolean;
}) {
  return <section className="source-bar" aria-label={t('Sources')}>
    <p className={`source-bar__feed source-bar__feed--${feed}`} role="status">
      <strong>{t(FEED_LABEL[feed])}</strong>
      {lastSignalAt && feed !== 'static' && <span> · {t('dernier signal {age}', { age: pastAge(language, new Date(lastSignalAt).toISOString(), clockNow) })}</span>}
      {latency && latency.count > 0 && <span className="source-bar__latency"> · {t('Latence affichage p95 : {ms} ms ({count} événements)', { ms: latency.p95, count: latency.count })}</span>}
    </p>
    <ul className="source-bar__sources">
      {health.map((source) => {
        const status = source.kind === 'push' && !source.lastOkAt && !source.lastErrorAt ? 'push' : sourceStatus(source, now);
        return <li key={source.id} className={`source source--${status}`} data-source={source.id} data-status={status}>
          <span className="source__dot" aria-hidden="true" />
          <strong>{source.label}</strong>
          <span>{status === 'push' ? t('Aucun événement depuis le démarrage') : t(STATUS_LABEL[status])}</span>
          {source.lastOkAt && <time dateTime={source.lastOkAt} title={absolute(language, source.lastOkAt)}>{t('relevé {age}', { age: pastAge(language, source.lastOkAt, now) })}</time>}
          {source.lastErrorAt && (status === 'unreachable' || !source.lastOkAt) && <time dateTime={source.lastErrorAt} title={absolute(language, source.lastErrorAt)}>{t('échec {age}', { age: pastAge(language, source.lastErrorAt, now) })}{source.lastError ? ` · ${translateDiagnostic(language, source.lastError)}` : ''}</time>}
          {source.cadenceMs && source.kind === 'poll' && <small>{t('cadence {seconds} s', { seconds: Math.round(source.cadenceMs / 1000) })}</small>}
          {source.warning && <small className="source__warning">{translateDiagnostic(language, source.warning)}</small>}
        </li>;
      })}
    </ul>
    <div className="source-bar__pending" data-pending={pending > 0 ? 'true' : undefined}>
      <small className="source-bar__frozen" aria-hidden={pending > 0 ? undefined : true}>{t('Affichage figé pendant la lecture.')}</small>
      <button type="button" className="source-bar__apply" onClick={onApply} hidden={pending === 0}>
        {reset ? t('Nouveau journal — appliquer') : t('{count} changements — appliquer', { count: pending })}
      </button>
    </div>
  </section>;
}
