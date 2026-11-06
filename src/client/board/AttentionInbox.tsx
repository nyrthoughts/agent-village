import type { AttentionItem, AttentionReason } from '../../shared/boardView.js';
import type { Language } from '../language.js';
import { CopyButton, duration, ProvenanceBadge, SourceLink, type Translate } from './format.js';

const TYPE_LABEL = { contradiction: 'Contradiction', decision: 'Décision', reply: 'À lire', validation: 'Validation' } as const;
/** Factual wording: a report or a stop signal is something to read, not an obligation to reply. */
export const REASON_LABEL: Record<AttentionReason, Parameters<Translate>[0]> = {
  claim_vs_ci: 'Succès déclaré sur un commit cité, CI en échec sur ce commit',
  claim_vs_ci_unpinned: 'Succès déclaré sans commit cité, CI en échec sur le dernier commit observé (à vérifier)',
  claim_vs_deploy: 'Succès déclaré sur un commit cité, déploiement en échec sur ce commit',
  claim_vs_deploy_unpinned: 'Succès déclaré sans commit cité, dernier déploiement observé en échec (à vérifier)',
  opposed_sessions: 'Déclarations opposées entre sessions',
  yaml_unproven: 'Déclaré vérifié sans preuve valide',
  agent_notification: 'Notification de l’agent (autorisation ou saisie demandée)',
  declared_blocker: 'Blocage déclaré',
  yaml_blocked: 'Tâche bloquée (YAML)',
  agent_report: 'Compte rendu à lire',
  agent_stopped: 'Signal d’arrêt de l’agent',
  declared_done: 'Terminé selon l’agent — à valider',
  yaml_review: 'En revue (YAML)',
};

export function AttentionInbox({ items, hidden, t, language, now, resume, canValidate, onOpen, onValidate, onSeen, onSnooze, onSession, onRestore }: {
  items: AttentionItem[]; hidden: number; t: Translate; language: Language; now: number;
  resume: (sessionId?: string) => string | undefined; canValidate: boolean;
  onOpen: (projectId: string) => void; onValidate: (projectId: string) => void; onSeen: (id: string) => void;
  onSnooze: (id: string, until: number) => void; onSession: (projectId: string | undefined, sessionId: string) => void; onRestore: () => void;
}) {
  // Snoozes use the wall clock, even when a fictional snapshot shows its capture time.
  const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); return date.getTime(); };
  return <section className="attention" aria-labelledby="attention-title">
    <header><h2 id="attention-title">{t('À toi')} <span className="count">{items.length}</span></h2><p>{t('Par type, plus ancienne attente d’abord.')}</p></header>
    {items.length === 0 && <p className="board-empty">{t('Rien ne t’attend.')}</p>}
    <ol className="attention__items">
      {items.map((item) => {
        const command = resume(item.sessionId);
        return <li key={item.id} className={`attention-item attention-item--${item.type}`} data-attention-type={item.type} data-anchor={item.id}>
          <header>
            <span className="attention-item__type">{t(TYPE_LABEL[item.type])}</span>
            <strong>{item.projectName}</strong>
            <time dateTime={item.since} title={item.since}>{t('depuis {age}', { age: duration(language, item.since, now) })}</time>
          </header>
          <p className="attention-item__reason">{t(REASON_LABEL[item.reason])}</p>
          {item.quotes.map((quote, index) => <blockquote key={index}>
            <p>{quote.text}</p>
            <footer><ProvenanceBadge value={quote.provenance} t={t} /> <SourceLink source={quote.ref} t={t} language={language} now={now}
              onSession={quote.ref.kind === 'session' ? (sessionId) => onSession(item.projectId, sessionId) : undefined} /></footer>
          </blockquote>)}
          <div className="attention-item__actions">
            {item.projectId && <button type="button" onClick={() => onOpen(item.projectId!)}>{t('Ouvrir')}</button>}
            {command && <CopyButton text={command} label={t('Copier la reprise')} t={t} />}
            {item.type === 'validation' && item.projectId && canValidate && <button type="button" onClick={() => onValidate(item.projectId!)}>{t('Valider avec une note')}</button>}
            <button type="button" onClick={() => onSeen(item.id)}>{t('Marquer vu')}</button>
            <button type="button" onClick={() => onSnooze(item.id, Date.now() + 60 * 60_000)}>{t('Reporter 1 h')}</button>
            <button type="button" onClick={() => onSnooze(item.id, tomorrow())}>{t('Reporter à demain')}</button>
          </div>
        </li>;
      })}
    </ol>
    {hidden > 0 && <p className="board-note">{t('{count} masqués (vus ou reportés)', { count: hidden })} <button type="button" className="link-button" onClick={onRestore}>{t('Tout réafficher')}</button></p>}
  </section>;
}
