import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { translate } from '../language.js';
import { toolLabel } from './AgentCharacter.js';
import { isConfirmedWorking, hasRecentActivity } from '../../shared/workerPresentation.js';

interface NotifEntry {
  id: string;
  tool: string;
  action: string;
  agent: string;
  desc: string;
  time: string;
  sessionId: string;
}

function relativeTime(at: string, now: number, language: Language): string {
  const diff = now - Date.parse(at);
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return language === 'fr' ? '\u00C0 l\u2019instant' : 'Just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

function actionLabel(session: ObservedSession, language: Language): string {
  if (isConfirmedWorking(session)) return language === 'fr' ? 'ACTIVIT\u00C9' : 'ACTIVITY';
  const lastReport = [...session.history].reverse().find((u) => u.kind === 'report') ?? session.history.at(-1);
  if (!lastReport) return language === 'fr' ? 'D\u00C9TECT\u00C9' : 'DETECTED';
  const text = lastReport.text.toLowerCase();
  if (/commit|push/i.test(text)) return 'COMMIT';
  if (/deploy|ship/i.test(text)) return language === 'fr' ? 'D\u00C9PLOIEMENT' : 'DEPLOY';
  if (/merge|pr.*merged/i.test(text)) return language === 'fr' ? 'FUSION' : 'MERGE';
  if (/ci\b|test.*pass|pipeline/i.test(text)) return 'CI';
  if (/pr\b|pull request|review/i.test(text)) return 'PR';
  return language === 'fr' ? 'ACTIVIT\u00C9' : 'ACTIVITY';
}

function buildNotifications(village: DerivedWorkspace, now: number, language: Language): NotifEntry[] {
  const entries: NotifEntry[] = [];
  for (const project of village.projects) {
    const sessions = project.observation?.sessions ?? [];
    for (const session of sessions) {
      if (session.role === 'helper') continue;
      if (!hasRecentActivity(session, now) && !session.history.length) continue;
      const lastUpdate = session.history[session.history.length - 1];
      const action = actionLabel(session, language);
      entries.push({
        id: `${project.id}:${session.id}`,
        tool: session.tool,
        action: `${toolLabel(session.tool).toUpperCase()} \u00B7 ${action}`,
        agent: toolLabel(session.tool),
        desc: lastUpdate
          ? `\u201C${lastUpdate.text.slice(0, 100)}${lastUpdate.text.length > 100 ? '\u2026' : ''}\u201D`
          : session.title ?? session.id,
        time: relativeTime(session.lastActivityAt, now, language),
        sessionId: session.id,
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.time === b.time) return 0;
    return a.time < b.time ? -1 : 1;
  }).slice(0, 12);
}

function toolIconClass(tool: string): string {
  if (tool === 'claude-code') return 'notif-item__icon--claude';
  if (tool === 'other') return 'notif-item__icon--forge';
  return `notif-item__icon--${tool}`;
}

export function NotificationPanel({
  village,
  now,
  language,
  onSelectSession,
  isDemoMode,
}: {
  village: DerivedWorkspace;
  now: number;
  language: Language;
  onSelectSession?: (sessionId: string) => void;
  isDemoMode?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(language, key, values);
  const entries = buildNotifications(village, now, language);

  return (
    <aside className="notif-panel" aria-label={t('\u00C0 toi')}>
      <div className="notif-panel__header">
        <h2 className="notif-panel__title">
          {t('\u00C0 toi')}
          {entries.length > 0 && <span className="notif-panel__count">{entries.length}</span>}
        </h2>
        {isDemoMode && (
          <span className="notif-panel__demo-badge">DEMO</span>
        )}
      </div>
      <p className="notif-panel__subtitle">{t('Depuis ta visite')}</p>
      {entries.length === 0 && (
        <p className="notif-panel__empty">{t('Aucun signal r\u00E9cent')}</p>
      )}
      <ul className="notif-panel__list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="notif-item"
              onClick={() => onSelectSession?.(entry.sessionId)}
            >
              <span className={`notif-item__icon ${toolIconClass(entry.tool)}`}>
                <img
                  src={`/sprites/bot-${entry.tool === 'claude-code' ? 'claude' : entry.tool === 'other' ? 'forge' : entry.tool}-idle.png`}
                  alt=""
                  className="notif-item__icon-img"
                  draggable={false}
                />
              </span>
              <span className="notif-item__content">
                <span className="notif-item__header">
                  <span className="notif-item__action">{entry.action.split(' \u00B7 ')[1]}</span>
                  {' \u00B7 '}
                  <span className="notif-item__tool">{entry.agent}</span>
                </span>
                <span className="notif-item__desc">{entry.desc}</span>
              </span>
              <span className="notif-item__time">{entry.time}</span>
            </button>
          </li>
        ))}
      </ul>
      {entries.length > 0 && (
        <button
          type="button"
          className="notif-panel__cta"
          onClick={() => onSelectSession?.(entries[0]!.sessionId)}
        >
          {t('R\u00E9pondre \u00E0 tes agents')} {'\u2192'}
        </button>
      )}
    </aside>
  );
}
