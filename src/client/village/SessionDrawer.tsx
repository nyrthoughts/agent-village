import { useEffect, useRef } from 'react';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { translate, translateDiagnostic } from '../language.js';
import { presentWorkerState } from '../../shared/workerPresentation.js';
import { toolLabel } from './AgentCharacter.js';

const stateLabels = {
  working: { fr: 'En cours', en: 'Working' },
  waiting: { fr: 'En attente', en: 'Waiting' },
  idle: { fr: 'Sans activité', en: 'Idle' },
  unknown: { fr: 'Inconnu', en: 'Unknown' },
} as const;

function resumeCommand(session: ObservedSession): string {
  const tool = session.tool;
  if (tool === 'codex') {
    return `codex --resume ${session.id}`;
  }
  if (tool === 'claude') {
    if (session.terminal) return `tmux attach -t ${session.terminal}`;
    return `claude --resume ${session.id}`;
  }
  return `# Session ${session.id} (${toolLabel(tool)})`;
}

export function SessionDrawer({
  session,
  allSessions,
  language,
  now,
  onClose,
}: {
  session: ObservedSession;
  allSessions: ObservedSession[];
  language: Language;
  now: number;
  onClose: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(language, key, values);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const state = presentWorkerState(session, true, now);
  const date = (value: string) =>
    new Date(value).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = [
          ...(drawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]',
          ) ?? []),
        ];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parent = session.parentId
    ? allSessions.find((s) => s.id === session.parentId)
    : undefined;
  const helpers = allSessions.filter((s) => s.parentId === session.id);

  return (
    <div
      className="session-drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className="session-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-drawer-title"
      >
        <header className="session-drawer__header">
          <div>
            <small>
              {toolLabel(session.tool).toUpperCase()} ·{' '}
              {t(session.role === 'helper' ? 'Sous-agent' : 'Conversation principale')}
            </small>
            <h2 id="session-drawer-title">{session.title ?? session.id}</h2>
          </div>
          <button
            ref={closeRef}
            className="session-drawer__close"
            type="button"
            aria-label={t('Fermer le projet')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="session-drawer__body">
          <dl className="session-drawer__facts">
            <div className="session-drawer__fact">
              <dt>{t('En cours')}</dt>
              <dd>{stateLabels[state][language]}</dd>
            </div>
            <div className="session-drawer__fact">
              <dt>{language === 'fr' ? 'Dernière activité' : 'Last activity'}</dt>
              <dd>{date(session.lastActivityAt)}</dd>
            </div>
            {session.activityEvidence && (
              <div className="session-drawer__fact">
                <dt>{language === 'fr' ? 'Niveau de preuve' : 'Evidence level'}</dt>
                <dd>
                  {t(
                    session.activityEvidence.level === 'confirmed'
                      ? 'Activité confirmée'
                      : session.activityEvidence.level === 'recent'
                        ? 'Activité récente'
                        : 'Activité détectée',
                  )}
                </dd>
              </div>
            )}
            {parent && (
              <div className="session-drawer__fact">
                <dt>{t('Conversation parente')}</dt>
                <dd>{parent.title ?? parent.id}</dd>
              </div>
            )}
          </dl>

          {session.objective && (
            <section>
              <h3>{t('Dernière demande')}</h3>
              <p>{session.objective}</p>
            </section>
          )}

          {session.summary && (
            <section>
              <h3>{t('Dernier compte rendu de l\u2019agent')}</h3>
              <p>{session.summary}</p>
            </section>
          )}

          <section>
            <h3>{language === 'fr' ? 'Commande de reprise (copie)' : 'Resume command (copy)'}</h3>
            <code className="session-drawer__resume">{resumeCommand(session)}</code>
          </section>

          {helpers.length > 0 && (
            <section>
              <h3>{t('{count} sous-agents détectés', { count: helpers.length })}</h3>
              <ul className="session-drawer__history">
                {helpers.map((h) => (
                  <li key={h.id} className="session-drawer__entry">
                    <small>
                      {toolLabel(h.tool)} · {stateLabels[presentWorkerState(h, true, now)][language]}
                    </small>
                    <p>{h.title ?? h.id}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>{t('Historique récent')}</h3>
            <ol className="session-drawer__history">
              {session.history
                .slice()
                .reverse()
                .map((update, i) => (
                  <li key={`${update.at}:${i}`} className="session-drawer__entry">
                    <small>
                      {date(update.at)} · {update.kind === 'report' ? 'Agent' : t('Demande')}
                    </small>
                    <p>{update.text}</p>
                  </li>
                ))}
            </ol>
          </section>

          {session.sourceNote && (
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {translateDiagnostic(language, session.sourceNote)}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
