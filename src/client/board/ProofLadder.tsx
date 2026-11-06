import type { LadderStep } from '../../shared/boardView.js';
import type { Language } from '../language.js';
import { absolute, SourceLink, type Translate } from './format.js';

const STEP_LABEL = { declared: 'Déclaré', activity: 'Activité', commit: 'Commit', ci: 'CI', merge: 'Fusion', deploy: 'Déploiement' } as const;
const STATE_LABEL = { observed: 'observé', failed: 'échec', pending: 'en attente de résultat', absent: 'non observé', 'other-sha': 'sur un autre commit', 'not-checked': 'non vérifié dans ce mode', inconclusive: 'non concluant (lecture partielle ou résultat inconnu)' } as const;

/** Each dot is one dated fact with its source. Unlit means not observed, never failure. */
export function ProofLadder({ steps, t, language, now, detailed = false, onSession }: {
  steps: LadderStep[]; t: Translate; language: Language; now: number; detailed?: boolean; onSession?: (sessionId: string) => void;
}) {
  if (!detailed) {
    return <ol className="ladder" aria-label={t('Échelle de preuves')}>
      {steps.map((step) => <li key={step.step} className={`ladder__dot ladder__dot--${step.state}`}
        title={`${t(STEP_LABEL[step.step])} · ${t(STATE_LABEL[step.state])}${step.at ? ` · ${absolute(language, step.at)}` : ''}${step.detail ? ` · ${step.detail}` : ''}`}>
        <span className="visually-hidden">{t(STEP_LABEL[step.step])} : {t(STATE_LABEL[step.state])}{step.at ? ` (${absolute(language, step.at)})` : ''}</span>
        <span aria-hidden="true">{t(STEP_LABEL[step.step])}</span>
      </li>)}
    </ol>;
  }
  return <section className="ladder-detail" aria-label={t('Échelle de preuves')}>
    <h3>{t('Échelle de preuves')}</h3>
    <ol>
      {steps.map((step) => <li key={step.step} className={`ladder-detail__step ladder__dot--${step.state}`}>
        <span className="ladder-detail__dot" aria-hidden="true" />
        <div>
          <strong>{t(STEP_LABEL[step.step])}</strong> <span>{t(STATE_LABEL[step.state])}</span>
          {step.detail && <p>{step.detail}</p>}
          {step.ref && <SourceLink source={step.ref} t={t} language={language} now={now} onSession={onSession} />}
        </div>
      </li>)}
    </ol>
    <p className="board-note">{t('Une pastille éteinte signifie « non observé », jamais « échec ». Aucun pourcentage.')}</p>
  </section>;
}
