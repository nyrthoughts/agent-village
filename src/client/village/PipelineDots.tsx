import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { translate } from '../language.js';

const STAGES = ['declared', 'activity', 'commit', 'CI', 'merge', 'deploy'] as const;
type Stage = (typeof STAGES)[number];

function sessionStages(session: ObservedSession): Set<Stage> {
  const active = new Set<Stage>();
  active.add('declared');
  if (session.state === 'working' || session.state === 'waiting') active.add('activity');
  for (const update of session.history) {
    const text = update.text.toLowerCase();
    if (/\bcommit|pushed|git push\b/i.test(text)) active.add('commit');
    if (/\bci\b|pipeline|check|test.*pass/i.test(text)) active.add('CI');
    if (/\bmerge|merged|pr.*merged\b/i.test(text)) active.add('merge');
    if (/\bdeploy|deployed|ship/i.test(text)) active.add('deploy');
  }
  return active;
}

export function projectStages(sessions: ObservedSession[]): Set<Stage> {
  const combined = new Set<Stage>();
  for (const session of sessions) {
    for (const stage of sessionStages(session)) combined.add(stage);
  }
  return combined;
}

export function PipelineDots({ sessions, language }: { sessions: ObservedSession[]; language: Language }) {
  const active = projectStages(sessions);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  return (
    <div className="pipeline-dots" aria-label={t('Pipeline')}>
      {STAGES.map((stage) => (
        <span key={stage} className="pipeline-dot">
          <span
            className={`pipeline-dot__circle${active.has(stage) ? ' pipeline-dot__circle--active' : ''}`}
            aria-label={`${stage}: ${active.has(stage) ? 'actif' : 'inactif'}`}
          />
          <span className="pipeline-dot__label">{stage}</span>
        </span>
      ))}
    </div>
  );
}
