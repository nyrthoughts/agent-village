import type { DigestGroup } from '../../shared/boardView.js';
import type { Language } from '../language.js';
import { ProvenanceBadge, SourceLink, type Translate } from './format.js';

const KIND_LABEL = { request: 'Demande', report: 'Compte rendu', commit: 'Commit', ci: 'CI', pr: 'Fusion', deploy: 'Déploiement', plan: 'Validation propriétaire', validation: 'Validation propriétaire', task: 'Tâche YAML', mapping: 'Rattacher' } as const;

/** Changes grouped by project; minor changes are folded into a count. */
export function SinceLastVisit({ groups, firstVisit, t, language, now, onOpen, onSeen, onSeenAll, onSession }: {
  groups: DigestGroup[]; firstVisit: boolean; t: Translate; language: Language; now: number;
  onOpen: (projectId: string) => void; onSeen: (projectId: string) => void; onSeenAll: () => void; onSession: (projectId: string | undefined, sessionId: string) => void;
}) {
  return <section className="digest" aria-labelledby="digest-title">
    <header><h2 id="digest-title">{t('Depuis ta dernière visite')}</h2>
      {firstVisit && <p>{t('Dernières 24 h (première visite sur ce journal)')}</p>}
      {groups.length > 0 && <button type="button" className="link-button" onClick={onSeenAll}>{t('Tout marquer vu')}</button>}
    </header>
    {groups.length === 0 && <p className="board-empty">{t('Rien de nouveau.')}</p>}
    <ul className="digest__groups">
      {groups.map((group) => <li key={group.projectId ?? group.projectName} className="digest-group" data-anchor={`digest:${group.projectId}`}>
        <header>
          {group.projectId ? <button type="button" className="link-button" onClick={() => onOpen(group.projectId!)}><strong>{group.projectName}</strong></button> : <strong>{group.projectName}</strong>}
          {group.projectId && <button type="button" className="link-button" onClick={() => onSeen(group.projectId!)}>{t('Marquer vu')}</button>}
        </header>
        <ul>
          {group.significant.slice(0, 3).map((entry) => <li key={entry.key}>
            <span className="digest__kind">{t(KIND_LABEL[entry.kind])}</span> <ProvenanceBadge value={entry.provenance} t={t} />
            <p>{entry.text.length > 160 ? `${entry.text.slice(0, 159)}…` : entry.text}</p>
            <SourceLink source={entry.ref} t={t} language={language} now={now} onSession={entry.ref.kind === 'session' ? (id) => onSession(group.projectId, id) : undefined} />
          </li>)}
        </ul>
        {group.significant.length > 3 && <small>{t('{count} autres', { count: group.significant.length - 3 })}</small>}
        {group.folded > 0 && <small className="digest__folded">{t('{count} changements mineurs repliés (états de session, demandes)', { count: group.folded })}</small>}
      </li>)}
    </ul>
  </section>;
}
