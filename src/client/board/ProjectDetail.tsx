import { forwardRef } from 'react';
import type { BoardSnapshot } from '../../shared/board.js';
import { resumeCommand, sessionPresence, type ProjectRow, type TimelineEntry } from '../../shared/boardView.js';
import type { SessionEntity } from '../../shared/projector.js';
import type { Language } from '../language.js';
import { ProjectPlanPanel } from '../ProjectPlanPanel.js';
import { CopyButton, ProvenanceBadge, SourceLink, Stamp, type Translate } from './format.js';
import { ProofLadder } from './ProofLadder.js';

const STATE_LABEL = { working: 'En cours', waiting: 'En attente', idle: 'Sans activité récente', unknown: 'État non confirmé' } as const;
const KIND_LABEL = { request: 'Demande', report: 'Compte rendu', commit: 'Commit', ci: 'CI', pr: 'Fusion', deploy: 'Déploiement', plan: 'Validation propriétaire', validation: 'Validation propriétaire', task: 'Tâche YAML', mapping: 'Rattacher' } as const;

export interface DetailProps {
  row: ProjectRow;
  snapshot: BoardSnapshot;
  timeline: TimelineEntry[];
  sessions: SessionEntity[];
  conversation?: string;
  editPlan: boolean;
  t: Translate;
  language: Language;
  now: number;
  onClose: () => void;
  onConversation: (sessionId?: string) => void;
  onSeen: () => void;
}

/** Right-hand detail panel; the project list stays visible. */
export const ProjectDetail = forwardRef<HTMLElement, DetailProps>(function ProjectDetail({ row, snapshot, timeline, sessions, conversation, editPlan, t, language, now, onClose, onConversation, onSeen }, ref) {
  const selectedSession = conversation ? snapshot.state.sessions[conversation] : undefined;
  const conversationEntries = conversation ? Object.values(snapshot.state.updates).filter((entry) => entry.sessionId === conversation).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : [];
  return <aside ref={ref} className="detail" aria-labelledby="detail-title" tabIndex={-1}>
    <header className="detail__header">
      <div><small>{t('Détail du projet')}</small><h2 id="detail-title">{row.name}</h2><p>{row.objective ?? t('Objectif non défini')}</p></div>
      <div className="detail__header-actions">
        <button type="button" className="link-button" onClick={onSeen}>{t('Marquer ce projet vu')}</button>
        <button type="button" className="detail__close" aria-label={t('Fermer le détail')} onClick={onClose}>×</button>
      </div>
    </header>
    {selectedSession || conversation ? <section className="conversation" aria-label={t('Conversation d’origine')}>
      <button type="button" className="link-button" onClick={() => onConversation(undefined)}>← {t('Retour aux conversations')}</button>
      <h3>{t('Conversation d’origine')} · {selectedSession?.title ?? conversation}</h3>
      {selectedSession && <SessionSummary session={selectedSession} t={t} language={language} now={now} />}
      <ol className="timeline" data-scroll-anchor-list>
        {conversationEntries.map((entry) => <li key={entry.key} data-anchor={entry.key}>
          <header><strong>{t(entry.kind === 'report' ? 'Compte rendu' : 'Demande')}</strong> <ProvenanceBadge value="declared" t={t} /> <Stamp at={entry.at} language={language} now={now} /></header>
          <p className="timeline__text">{entry.text}</p>
        </li>)}
      </ol>
    </section> : <>
      <ProofLadder steps={row.ladder} t={t} language={language} now={now} detailed onSession={(id) => onConversation(id)} />
      <ProjectPlanPanel key={`${row.id}:${editPlan}`} projectId={row.id} plan={snapshot.plans[row.id]} language={language} editable={snapshot.capabilities.editPlans} startEditing={editPlan} />
      <section className="detail__sessions" aria-label={t('Agents et sessions')}>
        <h3>{t('Agents et sessions')}</h3>
        <ul>
          {sessions.map((session) => <li key={session.id}>
            <SessionSummary session={session} t={t} language={language} now={now} />
            <div className="detail__session-actions">
              <button type="button" onClick={() => onConversation(session.id)}>{t('Ouvrir la conversation')}</button>
              {resumeCommand(session) && <CopyButton text={resumeCommand(session)!} label={t('Copier la reprise')} t={t} />}
            </div>
            {resumeCommand(session) && <p className="detail__resume"><small>{t('Commande de reprise (à copier, jamais exécutée)')}</small><code>{resumeCommand(session)}</code></p>}
          </li>)}
        </ul>
        <p className="board-note">{t('Observation n’est pas exécution : rien ici ne lance, n’arrête ni n’instruit un agent.')}</p>
      </section>
      <section className="detail__timeline" aria-label={t('Chronologie sourcée')}>
        <h3>{t('Chronologie sourcée')}</h3>
        {timeline.length === 0 && <p className="board-empty">{t('Aucune entrée sourcée.')}</p>}
        <ol className="timeline" data-scroll-anchor-list>
          {timeline.map((entry) => <li key={entry.key} data-anchor={entry.key} className={`timeline__entry timeline__entry--${entry.kind}`}>
            <header><strong>{t(KIND_LABEL[entry.kind])}</strong> <ProvenanceBadge value={entry.provenance} t={t} /></header>
            <p className="timeline__text">{entry.text.length > 700 ? `${entry.text.slice(0, 699)}…` : entry.text}</p>
            <SourceLink source={entry.ref} t={t} language={language} now={now} onSession={entry.ref.kind === 'session' ? (id) => onConversation(id) : undefined} />
          </li>)}
        </ol>
      </section>
    </>}
  </aside>;
});

const ROLE_LABEL = { helper: 'Sous-agent', lead: 'Conversation principale', unknown: 'Rôle non confirmé' } as const;

/** State as of `now`: an old or future working signal is shown as unconfirmed, never as current. */
function SessionSummary({ session, t, language, now }: { session: SessionEntity; t: Translate; language: Language; now: number }) {
  const presence = sessionPresence(session, now);
  return <div className="session-summary" data-session-state={presence.state}>
    <strong>{session.title}</strong>
    <small>{session.tool.toUpperCase()} · {t(ROLE_LABEL[session.role])} · {t(STATE_LABEL[presence.state])}
      {presence.level && <> · {t(presence.level === 'confirmed' ? 'Activité confirmée' : presence.level === 'recent' ? 'Activité récente' : 'Activité détectée')}</>}
      {' · '}{t('dernier signal')} {session.stateSource} · <Stamp at={session.stateAt} language={language} now={now} /></small>
    {session.terminal && <small>{t('Terminal tmux :')} <code>{session.terminal}</code></small>}
  </div>;
}
