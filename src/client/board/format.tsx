import { useState } from 'react';
import type { Provenance } from '../../shared/events.js';
import type { SourceRef } from '../../shared/boardView.js';
import { translate, type Language } from '../language.js';

export type Translate = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string;
export const translator = (language: Language): Translate => (key, values) => translate(language, key, values);

export function absolute(language: Language, value: string): string {
  return new Date(value).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function relative(language: Language, value: string | undefined, now: number): string {
  if (!value) return '—';
  const seconds = Math.round((Date.parse(value) - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3_600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3_600), 'hour');
  return format.format(Math.round(seconds / 86_400), 'day');
}

/** Elapsed duration without a direction, e.g. "12 min". */
export function duration(language: Language, from: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(from)) / 60_000));
  const unit = (value: number, kind: 'minute' | 'hour' | 'day') => new Intl.NumberFormat(language === 'en' ? 'en' : 'fr', { style: 'unit', unit: kind, unitDisplay: 'short' }).format(value);
  if (minutes < 60) return unit(minutes, 'minute');
  if (minutes < 48 * 60) return unit(Math.round(minutes / 60), 'hour');
  return unit(Math.round(minutes / 1_440), 'day');
}

/** Exact timestamp in the tooltip and machine-readable attribute; relative age as text. */
export function Stamp({ at, language, now }: { at: string; language: Language; now: number }) {
  return <time dateTime={at} title={at}>{absolute(language, at)} · {relative(language, at, now)}</time>;
}

export function ProvenanceBadge({ value, t }: { value: Provenance; t: Translate }) {
  return <span className={`provenance provenance--${value}`}>{t(value === 'declared' ? 'déclaré' : value === 'observed' ? 'observé' : 'vérifié')}</span>;
}

/** A link only when the source returned one; local sources open the in-app conversation. */
export function SourceLink({ source, t, language, now, onSession }: { source: SourceRef; t: Translate; language: Language; now: number; onSession?: (sessionId: string) => void }) {
  if (source.kind === 'session') {
    return <button type="button" className="source-link" onClick={() => onSession?.(source.sessionId)} disabled={!onSession}>
      {source.tool} · {source.title.slice(0, 60)} · <Stamp at={source.at} language={language} now={now} />
    </button>;
  }
  if (source.kind === 'fact') {
    return <span className="source-link">{source.url
      ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.label}</a>
      : source.label} · <Stamp at={source.at} language={language} now={now} /></span>;
  }
  return <span className="source-link">{t(source.kind === 'plan' ? 'Validation propriétaire' : 'Tâche YAML')} · <Stamp at={source.at} language={language} now={now} /></span>;
}

/** Copy-only: writes text to the clipboard; nothing is executed. */
export function CopyButton({ text, label, t }: { text: string; label: string; t: Translate }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return <span className="copy">
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setState('copied'); }
      catch { setState('failed'); }
    }}>{state === 'copied' ? t('Copié') : label}</button>
    {state === 'failed' && <span role="status"><code className="copy__fallback">{text}</code> {t('Copie impossible : sélectionnez le texte.')}</span>}
  </span>;
}
