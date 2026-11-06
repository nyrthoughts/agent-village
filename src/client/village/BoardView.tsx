import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { translate } from '../language.js';
import { toolLabel } from './AgentCharacter.js';
import { presentWorkerState } from '../../shared/workerPresentation.js';

const stateLabels: Record<string, Record<Language, string>> = {
  working: { fr: 'En cours', en: 'Working' },
  waiting: { fr: 'En attente', en: 'Waiting' },
  idle: { fr: 'Inactif', en: 'Idle' },
  unknown: { fr: 'Inconnu', en: 'Unknown' },
};

export function BoardView({
  village,
  language,
  now,
  onSelectSession,
}: {
  village: DerivedWorkspace;
  language: Language;
  now: number;
  onSelectSession?: (sessionId: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const allSessions: Array<{ session: ObservedSession; projectName: string }> = [];
  for (const project of village.projects) {
    for (const session of project.observation?.sessions ?? []) {
      if (session.role === 'helper') continue;
      allSessions.push({ session, projectName: project.name });
    }
  }

  allSessions.sort(
    (a, b) => Date.parse(b.session.lastActivityAt) - Date.parse(a.session.lastActivityAt),
  );

  const date = (value: string) =>
    new Date(value).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

  return (
    <div className="board-view">
      <h2>{language === 'fr' ? 'Tableau des sessions' : 'Session Board'}</h2>
      {allSessions.length === 0 && <p>{t('Aucun signal récent')}</p>}
      <table className="board-table">
        <thead>
          <tr>
            <th>{language === 'fr' ? 'Outil' : 'Tool'}</th>
            <th>{language === 'fr' ? 'Projet' : 'Project'}</th>
            <th>{language === 'fr' ? 'Session' : 'Session'}</th>
            <th>{language === 'fr' ? 'État' : 'State'}</th>
            <th>{language === 'fr' ? 'Dernière activité' : 'Last activity'}</th>
          </tr>
        </thead>
        <tbody>
          {allSessions.map(({ session, projectName }) => {
            const state = presentWorkerState(session, true, now);
            const toolClass = session.tool === 'other' ? 'forge' : session.tool;
            return (
              <tr
                key={session.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectSession?.(session.id)}
              >
                <td>
                  <span className={`board-table__tool board-table__tool--${toolClass}`}>
                    {toolLabel(session.tool)}
                  </span>
                </td>
                <td className="board-table__project">{projectName}</td>
                <td>{session.title ?? session.id}</td>
                <td>
                  <span className="board-table__state">
                    <span className={`board-table__state-dot board-table__state-dot--${state}`} />
                    {stateLabels[state]?.[language] ?? state}
                  </span>
                </td>
                <td>{date(session.lastActivityAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
